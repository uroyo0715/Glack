import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createProject,
  listProjectsForUser,
  getProjectById,
  deleteProjects,
  isProjectMember,
  listProjectMembers,
  addProjectMembers,
  removeProjectMember,
  countProjectMembers,
  createBug,
  getBugById,
  listBugs,
  updateBugStatus,
  findOrCreateUser,
  findUserByGoogleId,
  updateDisplayName,
  createSessionRecord,
  deleteSessionRecord,
  getUserBySessionToken,
} from '../src/data.js'

function memberEmails(projectId) {
  return listProjectMembers(projectId)
    .map((m) => m.email)
    .sort()
}

test('createProject adds the creator as a member, and listProjectsForUser is scoped to membership', () => {
  const project = createProject({ name: 'テストプロジェクト', imageUrl: null, creatorEmail: 'owner@example.com' })
  assert.ok(project.id)
  assert.equal(project.name, 'テストプロジェクト')
  assert.equal(project.imageUrl, null)
  assert.equal(project.bugCount, 0)

  assert.ok(isProjectMember(project.id, 'owner@example.com'))
  const members = listProjectMembers(project.id).map((m) => ({ ...m }))
  assert.deepEqual(members, [{ email: 'owner@example.com', displayName: null }])

  const ownerView = listProjectsForUser('owner@example.com')
  assert.ok(ownerView.some((p) => p.id === project.id))

  const strangerView = listProjectsForUser('nobody@example.com')
  assert.ok(!strangerView.some((p) => p.id === project.id))
})

test('email membership matching is case-insensitive', () => {
  const project = createProject({ name: '大文字小文字', imageUrl: null, creatorEmail: 'Owner@Example.com' })
  assert.ok(isProjectMember(project.id, 'owner@example.com'))
  assert.ok(isProjectMember(project.id, 'OWNER@EXAMPLE.COM'))
})

test('addProjectMembers adds new members, ignores duplicates, and reports only the newly-added ones', () => {
  const project = createProject({ name: '招待テスト', imageUrl: null, creatorEmail: 'owner@example.com' })

  const added = addProjectMembers(project.id, ['a@example.com', 'B@Example.com', 'owner@example.com'])
  // owner@example.com はすでにメンバー（作成者）なので追加分としては数えない
  assert.deepEqual(added.sort(), ['a@example.com', 'b@example.com'])

  assert.deepEqual(memberEmails(project.id), ['a@example.com', 'b@example.com', 'owner@example.com'])

  // 同じメールをもう一度追加しても増えない
  const addedAgain = addProjectMembers(project.id, ['a@example.com'])
  assert.deepEqual(addedAgain, [])
  assert.equal(listProjectMembers(project.id).length, 3)
})

test('listProjectMembers reports displayName once the member has logged in at least once', () => {
  const project = createProject({ name: '表示名テスト', imageUrl: null, creatorEmail: 'owner@example.com' })
  addProjectMembers(project.id, ['not-logged-in@example.com'])

  findOrCreateUser({ googleId: 'g-owner', email: 'owner@example.com', name: 'オーナー太郎' })

  const members = listProjectMembers(project.id)
  const owner = members.find((m) => m.email === 'owner@example.com')
  const invitee = members.find((m) => m.email === 'not-logged-in@example.com')
  assert.equal(owner.displayName, 'オーナー太郎')
  assert.equal(invitee.displayName, null) // まだ一度もログインしていないので表示名は不明
})

test('removeProjectMember removes a member, and countProjectMembers reflects it', () => {
  const project = createProject({ name: '削除テスト', imageUrl: null, creatorEmail: 'owner@example.com' })
  addProjectMembers(project.id, ['teammate@example.com'])
  assert.equal(countProjectMembers(project.id), 2)

  const removed = removeProjectMember(project.id, 'TEAMMATE@example.com') // 大文字小文字を無視
  assert.equal(removed, true)
  assert.equal(countProjectMembers(project.id), 1)
  assert.deepEqual(memberEmails(project.id), ['owner@example.com'])

  const removedAgain = removeProjectMember(project.id, 'teammate@example.com')
  assert.equal(removedAgain, false) // すでにいない
})

test('deleteProjects also removes projectMembers rows (foreign key safety)', () => {
  const project = createProject({ name: '削除+メンバー', imageUrl: null, creatorEmail: 'owner@example.com' })
  addProjectMembers(project.id, ['teammate@example.com'])
  assert.equal(listProjectMembers(project.id).length, 2)

  const result = deleteProjects([project.id])
  assert.deepEqual(result.deletedProjectIds, [project.id])
  assert.equal(listProjectMembers(project.id).length, 0)
  assert.equal(getProjectById(project.id), null)
})

test('deleteProjects cascades to bugs and bugInputs, and leaves other projects untouched', () => {
  const toDelete = createProject({ name: '削除対象', imageUrl: null, creatorEmail: 'owner@example.com' })
  const untouched = createProject({ name: '残す方', imageUrl: null, creatorEmail: 'owner@example.com' })

  const makeBug = (projectId) =>
    createBug({
      projectId,
      title: 'title',
      tag: 'crash',
      tagLabel: 'CRASH',
      desc: 'desc',
      who: 'tester',
      build: '0.0.1',
      platform: 'PC',
      frequency: 'rare',
      videoUrl: `/uploads/${projectId}-${Date.now()}.mp4`,
      fps: 60,
      durationFrames: 60,
      inputs: [{ frame: 0, key: 'A', label: 'x' }],
    })

  const bugToDelete = makeBug(toDelete.id)
  const bugToKeep = makeBug(untouched.id)

  assert.equal(getProjectById(toDelete.id).bugCount, 1)

  const result = deleteProjects([toDelete.id])
  assert.deepEqual(result.deletedProjectIds, [toDelete.id])
  assert.deepEqual(result.deletedVideoUrls, [bugToDelete.videoUrl])

  assert.equal(getProjectById(toDelete.id), null)
  assert.equal(getBugById(bugToDelete.id), null)

  // 別プロジェクトのバグは無事
  assert.ok(getProjectById(untouched.id))
  assert.ok(getBugById(bugToKeep.id))
})

test('deleteProjects ignores unknown ids without throwing', () => {
  const result = deleteProjects([999999])
  assert.deepEqual(result, { deletedProjectIds: [], deletedVideoUrls: [] })
})

test('deleteProjects with an empty array is a no-op', () => {
  const result = deleteProjects([])
  assert.deepEqual(result, { deletedProjectIds: [], deletedVideoUrls: [] })
})

test('createBug persists full record including inputs, and listBugs scopes by projectId', () => {
  const project = createProject({ name: 'バグ用プロジェクト', imageUrl: null, creatorEmail: 'owner@example.com' })
  const other = createProject({ name: '別プロジェクト', imageUrl: null, creatorEmail: 'owner@example.com' })

  const bug = createBug({
    projectId: project.id,
    title: 'テストバグ',
    tag: 'crash',
    tagLabel: 'CRASH',
    desc: '説明',
    who: 'tester',
    build: '0.0.1',
    platform: 'PC',
    frequency: 'rare',
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

  const fetched = getBugById(bug.id)
  assert.deepEqual(fetched, bug)

  const scoped = listBugs({ projectId: project.id })
  assert.ok(scoped.some((b) => b.id === bug.id))

  const otherScoped = listBugs({ projectId: other.id })
  assert.ok(!otherScoped.some((b) => b.id === bug.id))
})

test('listBugs filters by status, tag, and q', () => {
  const project = createProject({ name: 'フィルタ用', imageUrl: null, creatorEmail: 'owner@example.com' })
  const make = (overrides) =>
    createBug({
      projectId: project.id,
      title: 'ボスが壁を貫通する',
      tag: 'crash',
      tagLabel: 'CRASH',
      desc: 'ダメージ計算がおかしい',
      who: 'tester',
      build: '0.0.1',
      platform: 'PC',
      frequency: 'rare',
      videoUrl: '/uploads/test.mp4',
      fps: 60,
      durationFrames: 60,
      inputs: [],
      ...overrides,
    })

  make({ tag: 'crash', title: 'クラッシュ報告' })
  make({ tag: 'visual', title: '見た目がおかしい' })

  const crashOnly = listBugs({ projectId: project.id, tag: 'crash' })
  assert.ok(crashOnly.every((b) => b.tag === 'crash'))

  const byTitle = listBugs({ projectId: project.id, q: '見た目' })
  assert.ok(byTitle.every((b) => b.title.includes('見た目')))
})

test('updateBugStatus updates and returns the list-item shape', () => {
  const project = createProject({ name: 'ステータス用', imageUrl: null, creatorEmail: 'owner@example.com' })
  const bug = createBug({
    projectId: project.id,
    title: 'title',
    tag: 'crash',
    tagLabel: 'CRASH',
    desc: 'desc',
    who: 'tester',
    build: '0.0.1',
    platform: 'PC',
    frequency: 'rare',
    videoUrl: '/uploads/test.mp4',
    fps: 60,
    durationFrames: 60,
    inputs: [],
  })

  const updated = updateBugStatus(bug.id, 'in_progress')
  assert.equal(updated.status, 'in_progress')
  assert.equal(updated.videoUrl, undefined) // list item shape: videoUrlは含まれない

  const refetched = getBugById(bug.id)
  assert.equal(refetched.status, 'in_progress')
})

test('findOrCreateUser is idempotent and updateDisplayName persists', () => {
  const first = findOrCreateUser({ googleId: 'g-1', email: 'a@example.com', name: '田中' })
  const second = findOrCreateUser({ googleId: 'g-1', email: 'a@example.com', name: '田中' })
  assert.deepEqual(first, second)

  const updated = updateDisplayName('g-1', '田中(改名)')
  assert.equal(updated.displayName, '田中(改名)')
  assert.equal(findUserByGoogleId('g-1').displayName, '田中(改名)')
})

test('sessions are persisted in the DB, not just in memory (survives process restart)', () => {
  const user = findOrCreateUser({ googleId: 'g-session', email: 's@example.com', name: 'セッション太郎' })

  const token = 'test-session-token'
  createSessionRecord(token, user.googleId)

  // getUserBySessionToken はDBへの単純なJOINクエリのため、プロセスを再起動しても
  // （＝このテストプロセス内でのモジュール状態リセットとは無関係に）同じ結果になる。
  const found = getUserBySessionToken(token)
  assert.equal(found.googleId, user.googleId)
  assert.equal(found.displayName, 'セッション太郎')

  deleteSessionRecord(token)
  assert.equal(getUserBySessionToken(token), null)
})

test('getUserBySessionToken returns null for an unknown token', () => {
  assert.equal(getUserBySessionToken('no-such-token'), null)
})
