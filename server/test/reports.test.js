import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { startServer, stopServer, getBaseUrl, createAuthCookie, createManagedProject } from './helpers.js'
import { addProjectMembers } from '../src/data.js'

const PROJECT_OWNER_EMAIL = 'reports-owner@example.com'
let project
const uploadedFiles = []

before(async () => {
  await startServer()
  project = await createManagedProject({ name: 'レポートテスト用', imageUrl: null, creatorEmail: PROJECT_OWNER_EMAIL })
})

after(async () => {
  await stopServer()
  // POST /reports がserver/uploads配下に実際に書き込むテスト用ファイルを片付ける
  for (const videoUrl of uploadedFiles) {
    const filePath = path.join(import.meta.dirname, '..', videoUrl.replace(/^\//, ''))
    fs.rmSync(filePath, { force: true })
  }
})

function postReportForm({ projectId = project.id, tags = ['crash'], priority, includeVideo = true } = {}) {
  const metadata = {
    projectId,
    title: 'テスト報告',
    tags,
    desc: '説明',
    who: 'tester',
    build: '0.0.1',
    platform: 'PC',
    fps: 60,
    durationFrames: 60,
    inputs: [{ frame: 0, key: 'A', label: 'test' }],
  }
  if (priority !== undefined) metadata.priority = priority

  const form = new FormData()
  form.set('metadata', JSON.stringify(metadata))
  if (includeVideo) {
    form.set('video', new Blob([Buffer.from('fake video bytes')], { type: 'video/mp4' }), 'test.mp4')
  }
  return fetch(`${getBaseUrl()}/reports`, { method: 'POST', body: form })
}

test('GET /reports requires auth', async () => {
  const res = await fetch(`${getBaseUrl()}/reports?projectId=${project.id}`)
  assert.equal(res.status, 401)
})

test('GET /reports requires projectId', async () => {
  const { cookie } = await createAuthCookie()
  const res = await fetch(`${getBaseUrl()}/reports`, { headers: { Cookie: cookie } })
  assert.equal(res.status, 400)
})

test('GET /reports 404s for a project the user is not a member of', async () => {
  const { cookie } = await createAuthCookie() // レポートテスト用プロジェクトの非メンバー
  const res = await fetch(`${getBaseUrl()}/reports?projectId=${project.id}`, { headers: { Cookie: cookie } })
  assert.equal(res.status, 404)
})

test('GET /reports filters by priority', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const priorityProject = await createManagedProject({ name: '優先度フィルタ用', imageUrl: null, creatorEmail: PROJECT_OWNER_EMAIL })

  const high = await (await postReportForm({ projectId: priorityProject.id, priority: 'high' })).json()
  const low = await (await postReportForm({ projectId: priorityProject.id, priority: 'low' })).json()
  uploadedFiles.push(high.videoUrl, low.videoUrl)

  const res = await fetch(`${getBaseUrl()}/reports?projectId=${priorityProject.id}&priority=high`, {
    headers: { Cookie: cookie },
  })
  assert.equal(res.status, 200)
  const results = await res.json()
  assert.ok(results.every((b) => b.priority === 'high'))
  assert.ok(results.some((b) => b.id === high.id))
  assert.ok(!results.some((b) => b.id === low.id))
})

test('GET /reports filters by assignee, and GET /reports/facets lists assignees actually in use', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const assigneeProject = await createManagedProject({ name: '対応者フィルタ用', imageUrl: null, creatorEmail: PROJECT_OWNER_EMAIL })

  const created = await (await postReportForm({ projectId: assigneeProject.id })).json()
  uploadedFiles.push(created.videoUrl)
  assert.equal(created.assignee, '')

  const assignRes = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignee: 'yamada_dev' }),
  })
  assert.equal(assignRes.status, 200)

  const filtered = await fetch(`${getBaseUrl()}/reports?projectId=${assigneeProject.id}&assignee=yamada_dev`, {
    headers: { Cookie: cookie },
  })
  assert.equal(filtered.status, 200)
  const results = await filtered.json()
  assert.ok(results.every((b) => b.assignee === 'yamada_dev'))
  assert.ok(results.some((b) => b.id === created.id))

  const noMatch = await fetch(`${getBaseUrl()}/reports?projectId=${assigneeProject.id}&assignee=nobody`, {
    headers: { Cookie: cookie },
  })
  assert.deepEqual(await noMatch.json(), [])

  const facetsRes = await fetch(`${getBaseUrl()}/reports/facets?projectId=${assigneeProject.id}`, {
    headers: { Cookie: cookie },
  })
  const facets = await facetsRes.json()
  assert.deepEqual(facets.assignees, ['yamada_dev'])
})

test('POST /reports creates a bug with valid data (no API key configured)', async () => {
  delete process.env.GLANK_API_KEY
  const res = await postReportForm()
  assert.equal(res.status, 201)
  const bug = await res.json()
  assert.equal(bug.projectId, project.id)
  assert.equal(bug.status, 'todo')
  assert.equal(bug.priority, 'medium') // 省略時のデフォルト
  uploadedFiles.push(bug.videoUrl)
})

test('POST /reports rejects unknown projectId', async () => {
  const res = await postReportForm({ projectId: 999999 })
  assert.equal(res.status, 400)
})

test('POST /reports accepts free-text tags and uses them as their own labels', async () => {
  const res = await postReportForm({ tags: ['crash', 'サウンド不具合'] })
  assert.equal(res.status, 201)
  const bug = await res.json()
  assert.deepEqual(bug.tags, ['crash', 'サウンド不具合'])
  assert.deepEqual(bug.tagLabels, ['crash', 'サウンド不具合'])
  uploadedFiles.push(bug.videoUrl)
})

test('POST /reports rejects unknown priority but accepts empty string as default', async () => {
  const badRes = await postReportForm({ priority: 'not-a-real-priority' })
  assert.equal(badRes.status, 400)

  const emptyRes = await postReportForm({ priority: '' })
  assert.equal(emptyRes.status, 201)
  const bug = await emptyRes.json()
  assert.equal(bug.priority, 'medium')
  uploadedFiles.push(bug.videoUrl)
})

test('POST /reports requires a video file', async () => {
  const res = await postReportForm({ includeVideo: false })
  assert.equal(res.status, 400)
})

test('POST /reports enforces X-Glank-Key when GLANK_API_KEY is set', async () => {
  process.env.GLANK_API_KEY = 'super-secret'
  try {
    const rejected = await postReportForm()
    assert.equal(rejected.status, 401)

    const metadata = {
      projectId: project.id,
      title: 'キー付きテスト',
      tags: ['crash'],
      desc: 'd',
      who: 'tester',
      build: '0.0.1',
      platform: 'PC',
      fps: 60,
      durationFrames: 60,
      inputs: [],
    }
    const form = new FormData()
    form.set('metadata', JSON.stringify(metadata))
    form.set('video', new Blob([Buffer.from('fake video bytes')], { type: 'video/mp4' }), 'test.mp4')

    const accepted = await fetch(`${getBaseUrl()}/reports`, {
      method: 'POST',
      headers: { 'X-Glank-Key': 'super-secret' },
      body: form,
    })
    assert.equal(accepted.status, 201)
    const bug = await accepted.json()
    uploadedFiles.push(bug.videoUrl)
  } finally {
    delete process.env.GLANK_API_KEY
  }
})

test('GET /reports/:id and PATCH /reports/:id status transition', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)

  const detailRes = await fetch(`${getBaseUrl()}/reports/${created.id}`, { headers: { Cookie: cookie } })
  assert.equal(detailRes.status, 200)
  const detail = await detailRes.json()
  assert.deepEqual(detail.inputs, [{ frame: 0, key: 'A', label: 'test' }])

  const patchRes = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'in_progress' }),
  })
  assert.equal(patchRes.status, 200)
  const patched = await patchRes.json()
  assert.equal(patched.status, 'in_progress')
})

test('PATCH /reports/:id can update metadata fields (title/tag/build/etc.) after creation', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)

  const patchRes = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '修正後タイトル',
      build: '0.0.2',
      who: 'another-tester',
      platform: 'PS5',
      tags: ['softlock', 'visual'],
      priority: 'high',
      desc: '修正後の説明',
      assignee: 'yamada_dev',
    }),
  })
  assert.equal(patchRes.status, 200)
  const patched = await patchRes.json()
  assert.equal(patched.title, '修正後タイトル')
  assert.equal(patched.build, '0.0.2')
  assert.equal(patched.who, 'another-tester')
  assert.equal(patched.platform, 'PS5')
  assert.deepEqual(patched.tags, ['softlock', 'visual'])
  assert.deepEqual(patched.tagLabels, ['softlock', 'visual'])
  assert.equal(patched.priority, 'high')
  assert.equal(patched.desc, '修正後の説明')
  assert.equal(patched.assignee, 'yamada_dev')
  // ステータスは触れていないので元のまま
  assert.equal(patched.status, 'todo')

  // 動画・入力ログは編集対象外で維持される
  const detail = await (
    await fetch(`${getBaseUrl()}/reports/${created.id}`, { headers: { Cookie: cookie } })
  ).json()
  assert.equal(detail.videoUrl, created.videoUrl)
  assert.deepEqual(detail.inputs, created.inputs)
})

test('a new report has no assignee by default, and assignee can be set then cleared with an empty string', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)
  assert.equal(created.assignee, '')

  const assigned = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignee: 'yamada_dev' }),
  })
  assert.equal(assigned.status, 200)
  assert.equal((await assigned.json()).assignee, 'yamada_dev')

  // assigneeだけは他のテキストフィールドと違い、空文字で「未割り当て」に戻せる
  const unassigned = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignee: '' }),
  })
  assert.equal(unassigned.status, 200)
  assert.equal((await unassigned.json()).assignee, '')
})

test('PATCH /reports/:id rejects empty text fields and unknown priority, but accepts a custom tag', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)

  const emptyTitle = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '' }),
  })
  assert.equal(emptyTitle.status, 400)

  const emptyTags = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: [] }),
  })
  assert.equal(emptyTags.status, 400)

  const customTag = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: ['UIの崩れ'] }),
  })
  assert.equal(customTag.status, 200)
  const patched = await customTag.json()
  assert.deepEqual(patched.tags, ['UIの崩れ'])
  assert.deepEqual(patched.tagLabels, ['UIの崩れ'])

  const badPriority = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ priority: 'not-a-real-priority' }),
  })
  assert.equal(badPriority.status, 400)
})

test('GET /reports/facets returns distinct build/who/tag values used in the project', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const facetsProject = await createManagedProject({ name: 'ファセットテスト用', imageUrl: null, creatorEmail: PROJECT_OWNER_EMAIL })

  const first = await (await postReportForm({ projectId: facetsProject.id, tags: ['crash', 'サウンド不具合'] })).json()
  uploadedFiles.push(first.videoUrl)
  const patchRes = await fetch(`${getBaseUrl()}/reports/${first.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ build: '1.2.0', who: 'alice' }),
  })
  assert.equal(patchRes.status, 200)

  const res = await fetch(`${getBaseUrl()}/reports/facets?projectId=${facetsProject.id}`, {
    headers: { Cookie: cookie },
  })
  assert.equal(res.status, 200)
  const facets = await res.json()
  assert.deepEqual(facets, {
    builds: ['1.2.0'],
    whos: ['alice'],
    assignees: [],
    tags: ['crash', 'サウンド不具合'],
  })
})

test('GET /reports/facets requires auth and membership', async () => {
  const unauth = await fetch(`${getBaseUrl()}/reports/facets?projectId=${project.id}`)
  assert.equal(unauth.status, 401)

  const stranger = await createAuthCookie()
  const res = await fetch(`${getBaseUrl()}/reports/facets?projectId=${project.id}`, {
    headers: { Cookie: stranger.cookie },
  })
  assert.equal(res.status, 404)
})

test('GET /reports/:id and PATCH /reports/:id 404 for a project the user is not a member of', async () => {
  const stranger = await createAuthCookie()
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)

  const getRes = await fetch(`${getBaseUrl()}/reports/${created.id}`, { headers: { Cookie: stranger.cookie } })
  assert.equal(getRes.status, 404)

  const patchRes = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'PATCH',
    headers: { Cookie: stranger.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done' }),
  })
  assert.equal(patchRes.status, 404)
})

test('PATCH /reports/:id returns 404 for unknown id', async () => {
  const { cookie } = await createAuthCookie()
  const res = await fetch(`${getBaseUrl()}/reports/999999`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done' }),
  })
  assert.equal(res.status, 404)
})

function manualReportBody(overrides = {}) {
  return {
    projectId: project.id,
    title: '手動報告テスト',
    tags: ['visual'],
    desc: '動画なしの手動報告',
    who: 'tester',
    build: '0.0.1',
    platform: 'PC',
    ...overrides,
  }
}

test('POST /reports/manual requires auth and project membership', async () => {
  const unauth = await fetch(`${getBaseUrl()}/reports/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manualReportBody()),
  })
  assert.equal(unauth.status, 401)

  const { cookie } = await createAuthCookie() // 非メンバー
  const res = await fetch(`${getBaseUrl()}/reports/manual`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(manualReportBody()),
  })
  assert.equal(res.status, 404)
})

test('POST /reports/manual creates a bug with no video (empty videoUrl, zeroed frame data)', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const res = await fetch(`${getBaseUrl()}/reports/manual`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(manualReportBody()),
  })
  assert.equal(res.status, 201)
  const bug = await res.json()
  assert.equal(bug.projectId, project.id)
  assert.equal(bug.status, 'todo')
  assert.equal(bug.videoUrl, '')
  assert.equal(bug.fps, 0)
  assert.equal(bug.durationFrames, 0)
  assert.deepEqual(bug.inputs, [])
  assert.equal(bug.priority, 'medium')

  // 一覧・詳細どちらからも通常どおり取得できる
  const detail = await (
    await fetch(`${getBaseUrl()}/reports/${bug.id}`, { headers: { Cookie: cookie } })
  ).json()
  assert.equal(detail.title, '手動報告テスト')
})

test('POST /reports/manual validates required fields, and accepts a custom tag', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })

  const missing = await fetch(`${getBaseUrl()}/reports/manual`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(manualReportBody({ title: '' })),
  })
  assert.equal(missing.status, 400)

  const customTag = await fetch(`${getBaseUrl()}/reports/manual`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(manualReportBody({ tags: ['その他の不具合'] })),
  })
  assert.equal(customTag.status, 201)
  const bug = await customTag.json()
  assert.deepEqual(bug.tags, ['その他の不具合'])
  assert.deepEqual(bug.tagLabels, ['その他の不具合'])
})

function attachVideoForm({ fps = 30, durationFrames = 90 } = {}) {
  const form = new FormData()
  form.set('fps', String(fps))
  form.set('durationFrames', String(durationFrames))
  form.set('video', new Blob([Buffer.from('fake video bytes')], { type: 'video/mp4' }), 'later.mp4')
  return form
}

test('PATCH /reports/:id/video attaches a video to a manually-created report with no video', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (
    await fetch(`${getBaseUrl()}/reports/manual`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(manualReportBody()),
    })
  ).json()
  assert.equal(created.videoUrl, '')

  const res = await fetch(`${getBaseUrl()}/reports/${created.id}/video`, {
    method: 'PATCH',
    headers: { Cookie: cookie },
    body: attachVideoForm(),
  })
  assert.equal(res.status, 200)
  const updated = await res.json()
  uploadedFiles.push(updated.videoUrl)
  assert.notEqual(updated.videoUrl, '')
  assert.equal(updated.fps, 30)
  assert.equal(updated.durationFrames, 90)
  assert.deepEqual(updated.inputs, [])

  const videoPath = path.join(import.meta.dirname, '..', updated.videoUrl.replace(/^\//, ''))
  assert.equal(fs.existsSync(videoPath), true)
})

test('PATCH /reports/:id/video replaces an existing video and deletes the old file', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  const oldVideoPath = path.join(import.meta.dirname, '..', created.videoUrl.replace(/^\//, ''))
  assert.equal(fs.existsSync(oldVideoPath), true)

  const res = await fetch(`${getBaseUrl()}/reports/${created.id}/video`, {
    method: 'PATCH',
    headers: { Cookie: cookie },
    body: attachVideoForm({ fps: 24, durationFrames: 48 }),
  })
  assert.equal(res.status, 200)
  const updated = await res.json()
  uploadedFiles.push(updated.videoUrl)
  assert.notEqual(updated.videoUrl, created.videoUrl)
  assert.equal(fs.existsSync(oldVideoPath), false)
})

test('PATCH /reports/:id/video requires membership, a video file, and positive fps/durationFrames', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)

  const stranger = await createAuthCookie()
  const strangerRes = await fetch(`${getBaseUrl()}/reports/${created.id}/video`, {
    method: 'PATCH',
    headers: { Cookie: stranger.cookie },
    body: attachVideoForm(),
  })
  assert.equal(strangerRes.status, 404)

  const noFile = new FormData()
  noFile.set('fps', '30')
  noFile.set('durationFrames', '90')
  const noFileRes = await fetch(`${getBaseUrl()}/reports/${created.id}/video`, {
    method: 'PATCH',
    headers: { Cookie: cookie },
    body: noFile,
  })
  assert.equal(noFileRes.status, 400)

  const badFrames = await fetch(`${getBaseUrl()}/reports/${created.id}/video`, {
    method: 'PATCH',
    headers: { Cookie: cookie },
    body: attachVideoForm({ fps: 0, durationFrames: 90 }),
  })
  assert.equal(badFrames.status, 400)
})

test('DELETE /reports/:id deletes the report and requires membership', async () => {
  const { cookie } = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  const videoPath = path.join(import.meta.dirname, '..', created.videoUrl.replace(/^\//, ''))
  assert.equal(fs.existsSync(videoPath), true)

  const stranger = await createAuthCookie()
  const strangerRes = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'DELETE',
    headers: { Cookie: stranger.cookie },
  })
  assert.equal(strangerRes.status, 404)

  const res = await fetch(`${getBaseUrl()}/reports/${created.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.deleted, true)

  const getRes = await fetch(`${getBaseUrl()}/reports/${created.id}`, { headers: { Cookie: cookie } })
  assert.equal(getRes.status, 404)
  // 動画ファイルも一緒に削除される
  assert.equal(fs.existsSync(videoPath), false)
})

test('DELETE /reports/:id requires auth and returns 404 for unknown id', async () => {
  const unauth = await fetch(`${getBaseUrl()}/reports/1`, { method: 'DELETE' })
  assert.equal(unauth.status, 401)

  const { cookie } = await createAuthCookie()
  const res = await fetch(`${getBaseUrl()}/reports/999999`, { method: 'DELETE', headers: { Cookie: cookie } })
  assert.equal(res.status, 404)
})

test('GET/POST /reports/:id/comments lets members post and list comments in order', async () => {
  const owner = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)

  const empty = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
    headers: { Cookie: owner.cookie },
  })
  assert.equal(empty.status, 200)
  assert.deepEqual(await empty.json(), [])

  const first = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: '再現できました' }),
  })
  assert.equal(first.status, 201)
  const firstComment = await first.json()
  assert.equal(firstComment.body, '再現できました')
  assert.equal(firstComment.authorEmail, PROJECT_OWNER_EMAIL)
  assert.equal(firstComment.authorDisplayName, owner.user.displayName)
  assert.equal(firstComment.bugId, created.id)
  assert.ok(firstComment.createdAt)

  const teammate = await createAuthCookie({ email: PROJECT_OWNER_EMAIL }) // 同じメンバーとして2件目を投稿
  const second = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
    method: 'POST',
    headers: { Cookie: teammate.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: '私も確認しました' }),
  })
  assert.equal(second.status, 201)

  const list = await (
    await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, { headers: { Cookie: owner.cookie } })
  ).json()
  assert.equal(list.length, 2)
  assert.deepEqual(list.map((c) => c.body), ['再現できました', '私も確認しました'])
})

test('POST /reports/:id/comments requires membership, rejects an empty body, and 404s for an unknown report', async () => {
  const owner = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)

  const unauth = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'hi' }),
  })
  assert.equal(unauth.status, 401)

  const stranger = await createAuthCookie()
  const strangerRes = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
    method: 'POST',
    headers: { Cookie: stranger.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'hi' }),
  })
  assert.equal(strangerRes.status, 404)

  const empty = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: '   ' }),
  })
  assert.equal(empty.status, 400)

  const unknown = await fetch(`${getBaseUrl()}/reports/999999/comments`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'hi' }),
  })
  assert.equal(unknown.status, 404)
})

test('GET /reports/:id/comments requires membership and 404s for an unknown report', async () => {
  const owner = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)

  const unauth = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`)
  assert.equal(unauth.status, 401)

  const stranger = await createAuthCookie()
  const strangerRes = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
    headers: { Cookie: stranger.cookie },
  })
  assert.equal(strangerRes.status, 404)

  const unknown = await fetch(`${getBaseUrl()}/reports/999999/comments`, { headers: { Cookie: owner.cookie } })
  assert.equal(unknown.status, 404)
})

test('DELETE /reports/:id also removes its comments', async () => {
  const owner = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'コメント' }),
  })

  await fetch(`${getBaseUrl()}/reports/${created.id}`, { method: 'DELETE', headers: { Cookie: owner.cookie } })

  const after = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, { headers: { Cookie: owner.cookie } })
  assert.equal(after.status, 404) // 報告自体が無いので404（bugIndexも消えているため）
})

test('POST /reports/:id/comments with parentCommentId creates a reply, and rejects an unknown/foreign parent', async () => {
  const owner = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)

  const parent = await (
    await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
      method: 'POST',
      headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '親コメント' }),
    })
  ).json()

  const replyRes = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: '返信です', parentCommentId: parent.id }),
  })
  assert.equal(replyRes.status, 201)
  const reply = await replyRes.json()
  assert.equal(reply.parentCommentId, parent.id)

  const list = await (
    await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, { headers: { Cookie: owner.cookie } })
  ).json()
  assert.equal(list.find((c) => c.id === parent.id).parentCommentId, null)
  assert.equal(list.find((c) => c.id === reply.id).parentCommentId, parent.id)

  const unknownParent = await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'x', parentCommentId: 999999 }),
  })
  assert.equal(unknownParent.status, 400)

  // 別の報告に属するコメントIDを親に指定しても拒否される
  const otherReport = await (await postReportForm()).json()
  uploadedFiles.push(otherReport.videoUrl)
  const foreignParent = await fetch(`${getBaseUrl()}/reports/${otherReport.id}/comments`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'x', parentCommentId: parent.id }),
  })
  assert.equal(foreignParent.status, 400)
})

test('DELETE /reports/:id/comments/:commentId only lets the author delete, and cascades to replies', async () => {
  const owner = await createAuthCookie({ email: PROJECT_OWNER_EMAIL })
  const created = await (await postReportForm()).json()
  uploadedFiles.push(created.videoUrl)

  const parent = await (
    await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
      method: 'POST',
      headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '親コメント' }),
    })
  ).json()
  const reply = await (
    await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, {
      method: 'POST',
      headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '返信', parentCommentId: parent.id }),
    })
  ).json()

  // 同じプロジェクトの別メンバー（コメント投稿者本人ではない）は削除できない
  const teammate = await createAuthCookie()
  await addProjectMembers(project.id, [teammate.user.email])
  const teammateDelete = await fetch(
    `${getBaseUrl()}/reports/${created.id}/comments/${parent.id}`,
    { method: 'DELETE', headers: { Cookie: teammate.cookie } }
  )
  assert.equal(teammateDelete.status, 403)

  const nonMember = await createAuthCookie()
  const nonMemberDelete = await fetch(
    `${getBaseUrl()}/reports/${created.id}/comments/${parent.id}`,
    { method: 'DELETE', headers: { Cookie: nonMember.cookie } }
  )
  assert.equal(nonMemberDelete.status, 404)

  const ownerDelete = await fetch(
    `${getBaseUrl()}/reports/${created.id}/comments/${parent.id}`,
    { method: 'DELETE', headers: { Cookie: owner.cookie } }
  )
  assert.equal(ownerDelete.status, 200)
  assert.deepEqual(await ownerDelete.json(), { deleted: true })

  const list = await (
    await fetch(`${getBaseUrl()}/reports/${created.id}/comments`, { headers: { Cookie: owner.cookie } })
  ).json()
  assert.equal(list.find((c) => c.id === parent.id), undefined)
  assert.equal(list.find((c) => c.id === reply.id), undefined) // 返信も連動して削除される

  const unknown = await fetch(
    `${getBaseUrl()}/reports/${created.id}/comments/999999`,
    { method: 'DELETE', headers: { Cookie: owner.cookie } }
  )
  assert.equal(unknown.status, 404)
})
