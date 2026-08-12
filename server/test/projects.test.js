import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
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
