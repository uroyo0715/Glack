import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { startServer, stopServer, getBaseUrl, createAuthCookie } from './helpers.js'

before(startServer)
after(stopServer)

test('GET /projects requires auth', async () => {
  const res = await fetch(`${getBaseUrl()}/projects`)
  assert.equal(res.status, 401)
})

test('POST /projects requires a name', async () => {
  const { cookie } = await createAuthCookie()
  const form = new FormData()
  const res = await fetch(`${getBaseUrl()}/projects`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  })
  assert.equal(res.status, 400)
})

test('POST /projects creates a project without an image, then GET /projects lists it', async () => {
  const { cookie } = await createAuthCookie()
  const form = new FormData()
  form.set('name', 'Playwright Test Project')

  const createRes = await fetch(`${getBaseUrl()}/projects`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  })
  assert.equal(createRes.status, 201)
  const created = await createRes.json()
  assert.equal(created.name, 'Playwright Test Project')
  assert.equal(created.imageUrl, null)

  const listRes = await fetch(`${getBaseUrl()}/projects`, { headers: { Cookie: cookie } })
  assert.equal(listRes.status, 200)
  const list = await listRes.json()
  assert.ok(list.some((p) => p.id === created.id))
})

test('DELETE /projects requires auth', async () => {
  const res = await fetch(`${getBaseUrl()}/projects`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [1] }),
  })
  assert.equal(res.status, 401)
})

test('DELETE /projects validates the ids body', async () => {
  const { cookie } = await createAuthCookie()
  const res = await fetch(`${getBaseUrl()}/projects`, {
    method: 'DELETE',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [] }),
  })
  assert.equal(res.status, 400)

  const badTypeRes = await fetch(`${getBaseUrl()}/projects`, {
    method: 'DELETE',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ['not-a-number'] }),
  })
  assert.equal(badTypeRes.status, 400)
})

test('DELETE /projects removes the project(s) and they no longer appear in GET /projects', async () => {
  const { cookie } = await createAuthCookie()

  const createOne = async (name) => {
    const form = new FormData()
    form.set('name', name)
    const res = await fetch(`${getBaseUrl()}/projects`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    return res.json()
  }

  const a = await createOne('削除テストA')
  const b = await createOne('削除テストB')

  const deleteRes = await fetch(`${getBaseUrl()}/projects`, {
    method: 'DELETE',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [a.id, b.id] }),
  })
  assert.equal(deleteRes.status, 200)
  const body = await deleteRes.json()
  assert.deepEqual(new Set(body.deletedProjectIds), new Set([a.id, b.id]))

  const list = await (await fetch(`${getBaseUrl()}/projects`, { headers: { Cookie: cookie } })).json()
  assert.ok(!list.some((p) => p.id === a.id))
  assert.ok(!list.some((p) => p.id === b.id))
})

async function createProjectAs(cookie, name) {
  const form = new FormData()
  form.set('name', name)
  const res = await fetch(`${getBaseUrl()}/projects`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  })
  return res.json()
}

test('a user cannot see another user’s project in GET /projects', async () => {
  const owner = await createAuthCookie()
  const stranger = await createAuthCookie()

  const project = await createProjectAs(owner.cookie, '他人には見せないプロジェクト')

  const ownerList = await (await fetch(`${getBaseUrl()}/projects`, { headers: { Cookie: owner.cookie } })).json()
  assert.ok(ownerList.some((p) => p.id === project.id))

  const strangerList = await (
    await fetch(`${getBaseUrl()}/projects`, { headers: { Cookie: stranger.cookie } })
  ).json()
  assert.ok(!strangerList.some((p) => p.id === project.id))
})

test('a user cannot delete another user’s project via DELETE /projects', async () => {
  const owner = await createAuthCookie()
  const stranger = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, '削除されたくないプロジェクト')

  const res = await fetch(`${getBaseUrl()}/projects`, {
    method: 'DELETE',
    headers: { Cookie: stranger.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [project.id] }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body.deletedProjectIds, []) // 非メンバーのidは黙って無視される

  const stillThere = await (
    await fetch(`${getBaseUrl()}/projects`, { headers: { Cookie: owner.cookie } })
  ).json()
  assert.ok(stillThere.some((p) => p.id === project.id))
})

test('GET/POST /projects/:id/members require membership, and bulk-add works case-insensitively', async () => {
  const owner = await createAuthCookie()
  const stranger = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'メンバー管理テスト')

  const strangerGet = await fetch(`${getBaseUrl()}/projects/${project.id}/members`, {
    headers: { Cookie: stranger.cookie },
  })
  assert.equal(strangerGet.status, 404)

  const ownerGet = await fetch(`${getBaseUrl()}/projects/${project.id}/members`, {
    headers: { Cookie: owner.cookie },
  })
  assert.equal(ownerGet.status, 200)
  assert.deepEqual(await ownerGet.json(), [
    { email: owner.user.email, displayName: owner.user.displayName },
  ])

  const addRes = await fetch(`${getBaseUrl()}/projects/${project.id}/members`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails: ['Teammate@Example.com', ' another@example.com '] }),
  })
  assert.equal(addRes.status, 201)
  const addBody = await addRes.json()
  assert.deepEqual(addBody.added.sort(), ['another@example.com', 'teammate@example.com'])

  // 招待されたメンバーは、まだ一度もログインしていなくても（＝Google未認証でも）
  // 自分のメールでログインした瞬間にそのプロジェクトが見えるようになる
  const invited = await createAuthCookie({ email: 'teammate@example.com' })
  const invitedList = await (
    await fetch(`${getBaseUrl()}/projects`, { headers: { Cookie: invited.cookie } })
  ).json()
  assert.ok(invitedList.some((p) => p.id === project.id))
})

test('POST /projects/:id/members validates the emails body', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'バリデーションテスト')

  const res = await fetch(`${getBaseUrl()}/projects/${project.id}/members`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails: [] }),
  })
  assert.equal(res.status, 400)
})

test('DELETE /projects/:id/members removes a member and requires membership to call it', async () => {
  const owner = await createAuthCookie()
  const stranger = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, '削除メンバーテスト')

  await fetch(`${getBaseUrl()}/projects/${project.id}/members`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails: ['teammate@example.com'] }),
  })

  const strangerRes = await fetch(`${getBaseUrl()}/projects/${project.id}/members`, {
    method: 'DELETE',
    headers: { Cookie: stranger.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'teammate@example.com' }),
  })
  assert.equal(strangerRes.status, 404)

  const ownerRes = await fetch(`${getBaseUrl()}/projects/${project.id}/members`, {
    method: 'DELETE',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'TEAMMATE@example.com' }),
  })
  assert.equal(ownerRes.status, 200)
  const body = await ownerRes.json()
  assert.ok(!body.members.some((m) => m.email === 'teammate@example.com'))
})

test('DELETE /projects/:id/members refuses to remove the last remaining member', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, '最後の1人テスト')

  const res = await fetch(`${getBaseUrl()}/projects/${project.id}/members`, {
    method: 'DELETE',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: owner.user.email }),
  })
  assert.equal(res.status, 400)
})

// --- ストレージ設定（self_hosted / managed） ---

test('a new project defaults to storageMode self_hosted, unconfigured, and managed not allowed', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'ストレージ既定値テスト')

  const res = await fetch(`${getBaseUrl()}/projects/${project.id}/storage`, {
    headers: { Cookie: owner.cookie },
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    storageMode: 'self_hosted',
    isManagedAllowed: false,
    tursoConfigured: false,
    r2Configured: false,
  })
})

test('GET /projects/:id/storage requires membership', async () => {
  const owner = await createAuthCookie()
  const stranger = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'ストレージ非公開テスト')

  const res = await fetch(`${getBaseUrl()}/projects/${project.id}/storage`, {
    headers: { Cookie: stranger.cookie },
  })
  assert.equal(res.status, 404)
})

test('self_hosted projects block bug creation until Turso/R2 are configured, then unblock', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'self_hosted設定テスト')

  const missing = await fetch(`${getBaseUrl()}/reports/manual`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: project.id,
      title: 'まだ設定前',
      tags: ['crash'],
      desc: 'd',
      who: 'w',
      build: 'b',
      platform: 'p',
    }),
  })
  assert.equal(missing.status, 409)
  const missingBody = await missing.json()
  assert.equal(missingBody.code, 'turso_not_configured')

  // @libsql/clientはfile: URLもTursoのURLも同じインターフェースで扱えるため、
  // テストでは実際のTursoアカウントの代わりにローカルの一時ファイルを「self_hostedのTurso」として使う。
  const tursoUrl = `file:${path.join(os.tmpdir(), `glank-selfhosted-${crypto.randomUUID()}.sqlite`)}`
  const patchRes = await fetch(`${getBaseUrl()}/projects/${project.id}/storage`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ turso: { url: tursoUrl, authToken: 'unused-for-local-file' } }),
  })
  assert.equal(patchRes.status, 200)
  const status = await patchRes.json()
  assert.equal(status.storageMode, 'self_hosted')
  assert.equal(status.tursoConfigured, true)
  assert.equal(status.r2Configured, false) // R2はまだ未設定（動画なしのmanual報告ならR2不要）

  const created = await fetch(`${getBaseUrl()}/reports/manual`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: project.id,
      title: '設定後の報告',
      tags: ['crash'],
      desc: 'd',
      who: 'w',
      build: 'b',
      platform: 'p',
    }),
  })
  assert.equal(created.status, 201)
  const bug = await created.json()
  assert.equal(bug.title, '設定後の報告')

  // 実際にチーム自前のDB（ここではローカルファイル）に書き込まれていることを確認
  const detail = await fetch(`${getBaseUrl()}/reports/${bug.id}`, { headers: { Cookie: owner.cookie } })
  assert.equal(detail.status, 200)
})

test('switching to managed requires isManagedAllowed', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'managed拒否テスト')

  const res = await fetch(`${getBaseUrl()}/projects/${project.id}/storage`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageMode: 'managed' }),
  })
  assert.equal(res.status, 403)
})

test('PATCH /projects/:id/storage validates turso/r2 field shapes', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'バリデーションテスト2')

  const badMode = await fetch(`${getBaseUrl()}/projects/${project.id}/storage`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageMode: 'not-a-real-mode' }),
  })
  assert.equal(badMode.status, 400)

  const badTurso = await fetch(`${getBaseUrl()}/projects/${project.id}/storage`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ turso: { url: '' } }),
  })
  assert.equal(badTurso.status, 400)

  const badR2 = await fetch(`${getBaseUrl()}/projects/${project.id}/storage`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ r2: { accountId: 'a' } }),
  })
  assert.equal(badR2.status, 400)
})

test('new project defaults to no hidden field options', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'フィールド設定テスト')
  assert.deepEqual(project.hiddenFieldOptions, { tag: [], priority: [], platform: [] })
})

test('PATCH /projects/:id/field-options requires membership', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'フィールド設定権限テスト')
  const stranger = await createAuthCookie()

  const res = await fetch(`${getBaseUrl()}/projects/${project.id}/field-options`, {
    method: 'PATCH',
    headers: { Cookie: stranger.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: ['crash'] }),
  })
  assert.equal(res.status, 404)
})

test('PATCH /projects/:id/field-options hides preset options per project, and rejects unknown fields', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'フィールド設定テスト2')

  const bad = await fetch(`${getBaseUrl()}/projects/${project.id}/field-options`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notAField: [] }),
  })
  assert.equal(bad.status, 400)

  const badShape = await fetch(`${getBaseUrl()}/projects/${project.id}/field-options`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: 'crash' }),
  })
  assert.equal(badShape.status, 400)

  const res = await fetch(`${getBaseUrl()}/projects/${project.id}/field-options`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: ['crash'] }),
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { tag: ['crash'], priority: [], platform: [] })

  // 部分更新: 他のフィールドは維持される
  const res2 = await fetch(`${getBaseUrl()}/projects/${project.id}/field-options`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ priority: ['low'] }),
  })
  assert.equal(res2.status, 200)
  assert.deepEqual(await res2.json(), { tag: ['crash'], priority: ['low'], platform: [] })
})

test('new project defaults to no custom field options', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'カスタム項目テスト')
  assert.deepEqual(project.customFieldOptions, { tag: [], platform: [] })
})

test('POST /projects/:id/custom-options requires membership and validates the body', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'カスタム項目権限テスト')
  const stranger = await createAuthCookie()

  const forbidden = await fetch(`${getBaseUrl()}/projects/${project.id}/custom-options`, {
    method: 'POST',
    headers: { Cookie: stranger.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: 'tag', value: 'balance' }),
  })
  assert.equal(forbidden.status, 404)

  const badField = await fetch(`${getBaseUrl()}/projects/${project.id}/custom-options`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: 'priority', value: 'urgent' }),
  })
  assert.equal(badField.status, 400)

  const badValue = await fetch(`${getBaseUrl()}/projects/${project.id}/custom-options`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: 'tag', value: '' }),
  })
  assert.equal(badValue.status, 400)
})

test('POST/DELETE /projects/:id/custom-options adds and removes a project-specific preset', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'カスタム項目追加テスト')

  const added = await fetch(`${getBaseUrl()}/projects/${project.id}/custom-options`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: 'tag', value: 'バランス調整' }),
  })
  assert.equal(added.status, 200)
  assert.deepEqual(await added.json(), { tag: ['バランス調整'], platform: [] })

  // 重複追加はそのまま（増えない）
  const addedAgain = await fetch(`${getBaseUrl()}/projects/${project.id}/custom-options`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: 'tag', value: 'バランス調整' }),
  })
  assert.deepEqual(await addedAgain.json(), { tag: ['バランス調整'], platform: [] })

  const addedPlatform = await fetch(`${getBaseUrl()}/projects/${project.id}/custom-options`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: 'platform', value: 'Steam Deck' }),
  })
  assert.deepEqual(await addedPlatform.json(), { tag: ['バランス調整'], platform: ['Steam Deck'] })

  const removed = await fetch(`${getBaseUrl()}/projects/${project.id}/custom-options`, {
    method: 'DELETE',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: 'tag', value: 'バランス調整' }),
  })
  assert.equal(removed.status, 200)
  assert.deepEqual(await removed.json(), { tag: [], platform: ['Steam Deck'] })
})
