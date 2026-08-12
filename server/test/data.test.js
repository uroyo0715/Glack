import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../src/db.js'
import { createManagedProject } from './helpers.js'
import {
  createProject,
  listProjectsForUser,
  getProjectById,
  deleteProjects,
  deleteAllBugsForProject,
  isProjectMember,
  listProjectMembers,
  addProjectMembers,
  removeProjectMember,
  countProjectMembers,
  createBug,
  getBugById,
  listBugs,
  updateBugStatus,
  resolveBugProjectId,
  findOrCreateUser,
  findUserByGoogleId,
  updateDisplayName,
  createSessionRecord,
  deleteSessionRecord,
  getUserBySessionToken,
} from '../src/data.js'

async function memberEmails(projectId) {
  const members = await listProjectMembers(projectId)
  return members.map((m) => m.email).sort()
}

test('createProject adds the creator as a member, and listProjectsForUser is scoped to membership', async () => {
  const project = await createProject({ name: 'テストプロジェクト', imageUrl: null, creatorEmail: 'owner@example.com' })
  assert.ok(project.id)
  assert.equal(project.name, 'テストプロジェクト')
  assert.equal(project.imageUrl, null)
  assert.equal(project.bugCount, 0)

  assert.ok(await isProjectMember(project.id, 'owner@example.com'))
  const members = (await listProjectMembers(project.id)).map((m) => ({ ...m }))
  assert.deepEqual(members, [{ email: 'owner@example.com', displayName: null }])

  const ownerView = await listProjectsForUser('owner@example.com')
  assert.ok(ownerView.some((p) => p.id === project.id))

  const strangerView = await listProjectsForUser('nobody@example.com')
  assert.ok(!strangerView.some((p) => p.id === project.id))
})

test('email membership matching is case-insensitive', async () => {
  const project = await createProject({ name: '大文字小文字', imageUrl: null, creatorEmail: 'Owner@Example.com' })
  assert.ok(await isProjectMember(project.id, 'owner@example.com'))
  assert.ok(await isProjectMember(project.id, 'OWNER@EXAMPLE.COM'))
})

test('addProjectMembers adds new members, ignores duplicates, and reports only the newly-added ones', async () => {
  const project = await createProject({ name: '招待テスト', imageUrl: null, creatorEmail: 'owner@example.com' })

  const added = await addProjectMembers(project.id, ['a@example.com', 'B@Example.com', 'owner@example.com'])
  // owner@example.com はすでにメンバー（作成者）なので追加分としては数えない
  assert.deepEqual(added.sort(), ['a@example.com', 'b@example.com'])

  assert.deepEqual(await memberEmails(project.id), ['a@example.com', 'b@example.com', 'owner@example.com'])

  // 同じメールをもう一度追加しても増えない
  const addedAgain = await addProjectMembers(project.id, ['a@example.com'])
  assert.deepEqual(addedAgain, [])
  assert.equal((await listProjectMembers(project.id)).length, 3)
})

test('listProjectMembers reports displayName once the member has logged in at least once', async () => {
  const project = await createProject({ name: '表示名テスト', imageUrl: null, creatorEmail: 'owner@example.com' })
  await addProjectMembers(project.id, ['not-logged-in@example.com'])

  await findOrCreateUser({ googleId: 'g-owner', email: 'owner@example.com', name: 'オーナー太郎' })

  const members = await listProjectMembers(project.id)
  const owner = members.find((m) => m.email === 'owner@example.com')
  const invitee = members.find((m) => m.email === 'not-logged-in@example.com')
  assert.equal(owner.displayName, 'オーナー太郎')
  assert.equal(invitee.displayName, null) // まだ一度もログインしていないので表示名は不明
})

test('removeProjectMember removes a member, and countProjectMembers reflects it', async () => {
  const project = await createProject({ name: '削除テスト', imageUrl: null, creatorEmail: 'owner@example.com' })
  await addProjectMembers(project.id, ['teammate@example.com'])
  assert.equal(await countProjectMembers(project.id), 2)

  const removed = await removeProjectMember(project.id, 'TEAMMATE@example.com') // 大文字小文字を無視
  assert.equal(removed, true)
  assert.equal(await countProjectMembers(project.id), 1)
  assert.deepEqual(await memberEmails(project.id), ['owner@example.com'])

  const removedAgain = await removeProjectMember(project.id, 'teammate@example.com')
  assert.equal(removedAgain, false) // すでにいない
})

test('deleteProjects also removes projectMembers rows (foreign key safety)', async () => {
  const project = await createProject({ name: '削除+メンバー', imageUrl: null, creatorEmail: 'owner@example.com' })
  await addProjectMembers(project.id, ['teammate@example.com'])
  assert.equal((await listProjectMembers(project.id)).length, 2)

  const result = await deleteProjects([project.id])
  assert.deepEqual(result.deletedProjectIds, [project.id])
  assert.equal((await listProjectMembers(project.id)).length, 0)
  assert.equal(await getProjectById(project.id), null)
})

test('deleteProjects ignores unknown ids without throwing', async () => {
  const result = await deleteProjects([999999])
  assert.deepEqual(result, { deletedProjectIds: [] })
})

test('deleteProjects with an empty array is a no-op', async () => {
  const result = await deleteProjects([])
  assert.deepEqual(result, { deletedProjectIds: [] })
})

// バグ報告自体の削除は、保存先DBがプロジェクトごとに変わりうる（storageMode）ため
// data.jsのdeleteProjects()の責務ではなくなった。deleteAllBugsForProject()を
// ルート側（projects.jsのDELETE /projects）が明示的に呼ぶ形になっている。
test('deleteAllBugsForProject removes bugs/bugInputs for that project only, and reports deleted video URLs', async () => {
  const toDelete = await createManagedProject({ name: '削除対象', imageUrl: null, creatorEmail: 'owner@example.com' })
  const untouched = await createManagedProject({ name: '残す方', imageUrl: null, creatorEmail: 'owner@example.com' })

  const makeBug = (projectId) =>
    createBug(db, {
      projectId,
      title: 'title',
      tags: ['crash'],
      desc: 'desc',
      who: 'tester',
      build: '0.0.1',
      platform: 'PC',
      priority: 'low',
      videoUrl: `/uploads/${projectId}-${Date.now()}.mp4`,
      fps: 60,
      durationFrames: 60,
      inputs: [{ frame: 0, key: 'A', label: 'x' }],
    })

  const bugToDelete = await makeBug(toDelete.id)
  const bugToKeep = await makeBug(untouched.id)

  assert.equal((await getProjectById(toDelete.id)).bugCount, 1)

  const result = await deleteAllBugsForProject(db, toDelete.id)
  assert.deepEqual(result.deletedVideoUrls, [bugToDelete.videoUrl])

  assert.equal(await getBugById(db, bugToDelete.id), null)
  assert.equal(await resolveBugProjectId(bugToDelete.id), null) // bugIndexからも消える

  // 別プロジェクトのバグは無事
  assert.ok(await getBugById(db, bugToKeep.id))
})

test('createBug persists full record including inputs, and listBugs scopes by projectId', async () => {
  const project = await createManagedProject({ name: 'バグ用プロジェクト', imageUrl: null, creatorEmail: 'owner@example.com' })
  const other = await createManagedProject({ name: '別プロジェクト', imageUrl: null, creatorEmail: 'owner@example.com' })

  const bug = await createBug(db, {
    projectId: project.id,
    title: 'テストバグ',
    tags: ['crash'],
    desc: '説明',
    who: 'tester',
    build: '0.0.1',
    platform: 'PC',
    priority: 'low',
    videoUrl: '/uploads/test.mp4',
    fps: 60,
    durationFrames: 120,
    inputs: [
      { frame: 0, key: 'A', label: 'ジャンプ' },
      { frame: 10, key: 'B', label: '攻撃', holdFrames: 5 },
    ],
  })

  assert.equal(bug.status, 'todo')
  assert.equal(bug.projectId, project.id)
  assert.deepEqual(bug.inputs, [
    { frame: 0, key: 'A', label: 'ジャンプ' },
    { frame: 10, key: 'B', label: '攻撃', holdFrames: 5 },
  ])

  const fetched = await getBugById(db, bug.id)
  assert.deepEqual(fetched, bug)
  assert.equal(await resolveBugProjectId(bug.id), project.id)

  const scoped = await listBugs(db, { projectId: project.id })
  assert.ok(scoped.some((b) => b.id === bug.id))

  const otherScoped = await listBugs(db, { projectId: other.id })
  assert.ok(!otherScoped.some((b) => b.id === bug.id))
})

test('listBugs filters by status, tag, and q', async () => {
  const project = await createManagedProject({ name: 'フィルタ用', imageUrl: null, creatorEmail: 'owner@example.com' })
  const make = (overrides) =>
    createBug(db, {
      projectId: project.id,
      title: 'ボスが壁を貫通する',
      tags: ['crash'],
      desc: 'ダメージ計算がおかしい',
      who: 'tester',
      build: '0.0.1',
      platform: 'PC',
      priority: 'low',
      videoUrl: '/uploads/test.mp4',
      fps: 60,
      durationFrames: 60,
      inputs: [],
      ...overrides,
    })

  await make({ tags: ['crash'], title: 'クラッシュ報告' })
  await make({ tags: ['visual'], title: '見た目がおかしい' })
  await make({ tags: ['crash', 'visual'], title: '複数タグ報告' })

  const crashOnly = await listBugs(db, { projectId: project.id, tag: 'crash' })
  assert.ok(crashOnly.every((b) => b.tags.includes('crash')))
  assert.equal(crashOnly.length, 2)

  const byTitle = await listBugs(db, { projectId: project.id, q: '見た目' })
  assert.ok(byTitle.every((b) => b.title.includes('見た目')))
})

test('updateBugStatus updates and returns the list-item shape', async () => {
  const project = await createManagedProject({ name: 'ステータス用', imageUrl: null, creatorEmail: 'owner@example.com' })
  const bug = await createBug(db, {
    projectId: project.id,
    title: 'title',
    tags: ['crash'],
    desc: 'desc',
    who: 'tester',
    build: '0.0.1',
    platform: 'PC',
    priority: 'low',
    videoUrl: '/uploads/test.mp4',
    fps: 60,
    durationFrames: 60,
    inputs: [],
  })

  const updated = await updateBugStatus(db, bug.id, 'in_progress')
  assert.equal(updated.status, 'in_progress')
  assert.equal(updated.videoUrl, undefined) // list item shape: videoUrlは含まれない

  const refetched = await getBugById(db, bug.id)
  assert.equal(refetched.status, 'in_progress')
})

test('findOrCreateUser is idempotent and updateDisplayName persists', async () => {
  const first = await findOrCreateUser({ googleId: 'g-1', email: 'a@example.com', name: '田中' })
  const second = await findOrCreateUser({ googleId: 'g-1', email: 'a@example.com', name: '田中' })
  assert.deepEqual(first, second)

  const updated = await updateDisplayName('g-1', '田中(改名)')
  assert.equal(updated.displayName, '田中(改名)')
  assert.equal((await findUserByGoogleId('g-1')).displayName, '田中(改名)')
})

test('sessions are persisted in the DB, not just in memory (survives process restart)', async () => {
  const user = await findOrCreateUser({ googleId: 'g-session', email: 's@example.com', name: 'セッション太郎' })

  const token = 'test-session-token'
  await createSessionRecord(token, user.googleId)

  // getUserBySessionToken はDBへの単純なJOINクエリのため、プロセスを再起動しても
  // （＝このテストプロセス内でのモジュール状態リセットとは無関係に）同じ結果になる。
  const found = await getUserBySessionToken(token)
  assert.equal(found.googleId, user.googleId)
  assert.equal(found.displayName, 'セッション太郎')

  await deleteSessionRecord(token)
  assert.equal(await getUserBySessionToken(token), null)
})

test('getUserBySessionToken returns null for an unknown token', async () => {
  assert.equal(await getUserBySessionToken('no-such-token'), null)
})
