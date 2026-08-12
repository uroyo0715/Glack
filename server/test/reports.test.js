import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { startServer, stopServer, getBaseUrl, createAuthCookie, createManagedProject } from './helpers.js'

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
  // ステータスは触れていないので元のまま
  assert.equal(patched.status, 'todo')

  // 動画・入力ログは編集対象外で維持される
  const detail = await (
    await fetch(`${getBaseUrl()}/reports/${created.id}`, { headers: { Cookie: cookie } })
  ).json()
  assert.equal(detail.videoUrl, created.videoUrl)
  assert.deepEqual(detail.inputs, created.inputs)
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
  assert.deepEqual(facets, { builds: ['1.2.0'], whos: ['alice'], tags: ['crash', 'サウンド不具合'] })
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
