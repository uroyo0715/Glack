import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { startServer, stopServer, getBaseUrl, createAuthCookie, createManagedProject } from './helpers.js'
import { setProjectManagedAllowed, updateProjectStorageConfig } from '../src/data.js'
import { encryptR2Config } from '../src/projectDataAccess.js'

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

test('POST /projects defaults gameEngine to empty string, accepts a valid value, and rejects an unknown one', async () => {
  const { cookie } = await createAuthCookie()

  const defaultForm = new FormData()
  defaultForm.set('name', 'エンジン未指定プロジェクト')
  const defaultRes = await fetch(`${getBaseUrl()}/projects`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: defaultForm,
  })
  assert.equal(defaultRes.status, 201)
  assert.equal((await defaultRes.json()).gameEngine, '')

  const godotForm = new FormData()
  godotForm.set('name', 'Godotプロジェクト')
  godotForm.set('gameEngine', 'godot')
  const godotRes = await fetch(`${getBaseUrl()}/projects`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: godotForm,
  })
  assert.equal(godotRes.status, 201)
  assert.equal((await godotRes.json()).gameEngine, 'godot')

  const badForm = new FormData()
  badForm.set('name', '不正なエンジン')
  badForm.set('gameEngine', 'not-a-real-engine')
  const badRes = await fetch(`${getBaseUrl()}/projects`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: badForm,
  })
  assert.equal(badRes.status, 400)
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

test('a new project defaults to storageMode self_hosted, unconfigured, and managed allowed', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'ストレージ既定値テスト')

  const res = await fetch(`${getBaseUrl()}/projects/${project.id}/storage`, {
    headers: { Cookie: owner.cookie },
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    storageMode: 'self_hosted',
    isManagedAllowed: true,
    tursoConfigured: false,
    r2Configured: false,
    configuredByName: null,
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
  // 新規プロジェクトは既定でisManagedAllowed=trueのため、拒否されるケース自体を
  // テストするにはここで明示的にfalseへ戻す必要がある。
  await setProjectManagedAllowed(project.id, false)

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

test('PATCH /projects/:id/storage records who configured it', async () => {
  const owner = await createAuthCookie({ name: '設定太郎' })
  const project = await createProjectAs(owner.cookie, '設定者記録テスト')
  const tursoUrl = `file:${path.join(os.tmpdir(), `glank-configured-by-${crypto.randomUUID()}.sqlite`)}`

  const res = await fetch(`${getBaseUrl()}/projects/${project.id}/storage`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ turso: { url: tursoUrl, authToken: 'unused' } }),
  })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).configuredByName, '設定太郎')
})

test('saved storage configs can be recalled by the same owner on another project, but not by other members', async () => {
  const owner = await createAuthCookie({ name: '呼び出し花子' })
  const teammate = await createAuthCookie()
  const stranger = await createAuthCookie()

  const sourceProject = await createProjectAs(owner.cookie, '呼び出し元プロジェクト')
  const tursoUrl = `file:${path.join(os.tmpdir(), `glank-saved-${crypto.randomUUID()}.sqlite`)}`
  const savePatch = await fetch(`${getBaseUrl()}/projects/${sourceProject.id}/storage`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      turso: { url: tursoUrl, authToken: 'unused' },
      r2: {
        accountId: 'acc',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        bucket: 'bucket',
        publicUrl: 'https://pub-example.r2.dev',
      },
    }),
  })
  assert.equal(savePatch.status, 200)

  const targetProject = await createProjectAs(owner.cookie, '適用先プロジェクト')
  await fetch(`${getBaseUrl()}/projects/${targetProject.id}/members`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails: [teammate.user.email] }),
  })

  // 設定した本人には、そのプロジェクト以外の場所で呼び出せる設定として見える
  const ownList = await fetch(`${getBaseUrl()}/projects/${targetProject.id}/storage/saved-configs`, {
    headers: { Cookie: owner.cookie },
  })
  assert.equal(ownList.status, 200)
  const ownConfigs = await ownList.json()
  assert.equal(ownConfigs.length, 1)
  assert.equal(ownConfigs[0].sourceProjectId, sourceProject.id)
  assert.equal(ownConfigs[0].sourceProjectName, '呼び出し元プロジェクト')
  assert.equal(ownConfigs[0].hasTurso, true)
  assert.equal(ownConfigs[0].hasR2, true)

  // 同じプロジェクトの他メンバーには、他人（owner）が設定したものは一切見えない
  const teammateList = await fetch(`${getBaseUrl()}/projects/${targetProject.id}/storage/saved-configs`, {
    headers: { Cookie: teammate.cookie },
  })
  assert.equal(teammateList.status, 200)
  assert.deepEqual(await teammateList.json(), [])

  // メンバーでない第三者は一覧取得自体ができない
  const strangerList = await fetch(`${getBaseUrl()}/projects/${targetProject.id}/storage/saved-configs`, {
    headers: { Cookie: stranger.cookie },
  })
  assert.equal(strangerList.status, 404)

  // 本人がapply-savedで適用すると、対象プロジェクトに接続情報がコピーされ、設定者名も本人になる
  const applyRes = await fetch(`${getBaseUrl()}/projects/${targetProject.id}/storage/apply-saved`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ savedConfigId: ownConfigs[0].id }),
  })
  assert.equal(applyRes.status, 200)
  const applied = await applyRes.json()
  assert.equal(applied.tursoConfigured, true)
  assert.equal(applied.r2Configured, true)
  assert.equal(applied.configuredByName, '呼び出し花子')

  // 他メンバーが同じsavedConfigIdを指定しても、自分の所有物ではないため404
  const teammateApply = await fetch(`${getBaseUrl()}/projects/${targetProject.id}/storage/apply-saved`, {
    method: 'POST',
    headers: { Cookie: teammate.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ savedConfigId: ownConfigs[0].id }),
  })
  assert.equal(teammateApply.status, 404)
})

// R2/Tursoが「この保存済み設定を呼び出す」機能の導入より前から既に設定されていたプロジェクト
// （＝savedStorageConfigsにまだ行がない）で、片方だけを再設定した場合の回帰テスト。
// 一度だけ触った方の値だけを保存すると、既に設定済みだったもう片方が保存済み設定から
// 消えてしまうバグがあった（プロジェクト自体には残っているのに、呼び出す側には現れない）。
test('re-saving only turso on a project that already had r2 configured keeps r2 in the saved config too', async () => {
  const owner = await createAuthCookie()
  const sourceProject = await createProjectAs(owner.cookie, '既存R2設定済みプロジェクト')

  // この機能の導入前と同じ状態を再現するため、ルート経由ではなくdata.js直で
  // r2ConfigEncだけを先に設定しておく（＝savedStorageConfigsにはまだ何も残らない）。
  await updateProjectStorageConfig(sourceProject.id, {
    r2ConfigEnc: encryptR2Config({
      accountId: 'acc',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucket: 'bucket',
      publicUrl: 'https://pub-example.r2.dev',
    }),
  })

  // この機能の導入後、Tursoだけを（再）設定する。
  const tursoUrl = `file:${path.join(os.tmpdir(), `glank-repro-${crypto.randomUUID()}.sqlite`)}`
  const tursoPatch = await fetch(`${getBaseUrl()}/projects/${sourceProject.id}/storage`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ turso: { url: tursoUrl, authToken: 'unused' } }),
  })
  assert.equal(tursoPatch.status, 200)

  const targetProject = await createProjectAs(owner.cookie, '適用先プロジェクト2')
  const list = await fetch(`${getBaseUrl()}/projects/${targetProject.id}/storage/saved-configs`, {
    headers: { Cookie: owner.cookie },
  })
  const configs = await list.json()
  assert.equal(configs[0].hasTurso, true)
  assert.equal(configs[0].hasR2, true) // ここが導入前から設定済みだったR2

  const applyRes = await fetch(`${getBaseUrl()}/projects/${targetProject.id}/storage/apply-saved`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ savedConfigId: configs[0].id }),
  })
  const applied = await applyRes.json()
  assert.equal(applied.r2Configured, true)
})

test('POST /projects/:id/storage/apply-saved validates the body and requires membership', async () => {
  const owner = await createAuthCookie()
  const stranger = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, 'apply-saved検証テスト')

  const badBody = await fetch(`${getBaseUrl()}/projects/${project.id}/storage/apply-saved`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert.equal(badBody.status, 400)

  const strangerRes = await fetch(`${getBaseUrl()}/projects/${project.id}/storage/apply-saved`, {
    method: 'POST',
    headers: { Cookie: stranger.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ savedConfigId: 1 }),
  })
  assert.equal(strangerRes.status, 404)
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

test('PATCH /projects/:id updates the name and/or image together, and rejects an empty name', async () => {
  const owner = await createAuthCookie()
  const project = await createManagedProject({
    name: '編集前の名前',
    imageUrl: null,
    creatorEmail: owner.user.email,
  })

  const nameOnlyForm = new FormData()
  nameOnlyForm.set('name', '編集後の名前')
  const nameOnlyRes = await fetch(`${getBaseUrl()}/projects/${project.id}`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie },
    body: nameOnlyForm,
  })
  assert.equal(nameOnlyRes.status, 200)
  const nameOnlyUpdated = await nameOnlyRes.json()
  assert.equal(nameOnlyUpdated.name, '編集後の名前')
  assert.equal(nameOnlyUpdated.imageUrl, null)

  const bothForm = new FormData()
  bothForm.set('name', 'さらに編集後')
  bothForm.set('image', new Blob([Buffer.from('fake image')], { type: 'image/png' }), 'photo.png')
  const bothRes = await fetch(`${getBaseUrl()}/projects/${project.id}`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie },
    body: bothForm,
  })
  assert.equal(bothRes.status, 200)
  const bothUpdated = await bothRes.json()
  assert.equal(bothUpdated.name, 'さらに編集後')
  assert.ok(bothUpdated.imageUrl)

  const emptyNameForm = new FormData()
  emptyNameForm.set('name', '   ')
  const emptyNameRes = await fetch(`${getBaseUrl()}/projects/${project.id}`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie },
    body: emptyNameForm,
  })
  assert.equal(emptyNameRes.status, 400)
})

test('PATCH /projects/:id updates gameEngine, and rejects an unknown value', async () => {
  const owner = await createAuthCookie()
  const project = await createManagedProject({
    name: 'エンジン変更テスト',
    imageUrl: null,
    creatorEmail: owner.user.email,
  })
  assert.equal(project.gameEngine, '')

  const unityForm = new FormData()
  unityForm.set('gameEngine', 'unity')
  const unityRes = await fetch(`${getBaseUrl()}/projects/${project.id}`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie },
    body: unityForm,
  })
  assert.equal(unityRes.status, 200)
  assert.equal((await unityRes.json()).gameEngine, 'unity')

  const badForm = new FormData()
  badForm.set('gameEngine', 'unreal')
  const badRes = await fetch(`${getBaseUrl()}/projects/${project.id}`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie },
    body: badForm,
  })
  assert.equal(badRes.status, 400)

  // 空文字を渡すと「未設定」に戻せる
  const clearForm = new FormData()
  clearForm.set('gameEngine', '')
  const clearRes = await fetch(`${getBaseUrl()}/projects/${project.id}`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie },
    body: clearForm,
  })
  assert.equal(clearRes.status, 200)
  assert.equal((await clearRes.json()).gameEngine, '')
})

test('PATCH /projects/:id requires membership', async () => {
  const owner = await createAuthCookie()
  const project = await createProjectAs(owner.cookie, '権限テスト用')
  const stranger = await createAuthCookie()

  const form = new FormData()
  form.set('name', '勝手に変更')
  const res = await fetch(`${getBaseUrl()}/projects/${project.id}`, {
    method: 'PATCH',
    headers: { Cookie: stranger.cookie },
    body: form,
  })
  assert.equal(res.status, 404)
})

test('PATCH /projects/:id/image sets/replaces the project image, and DELETE clears it', async () => {
  const owner = await createAuthCookie()
  const project = await createManagedProject({
    name: '画像更新テスト',
    imageUrl: null,
    creatorEmail: owner.user.email,
  })
  assert.equal(project.imageUrl, null)

  const form1 = new FormData()
  form1.set('image', new Blob([Buffer.from('fake image 1')], { type: 'image/png' }), 'first.png')
  const firstRes = await fetch(`${getBaseUrl()}/projects/${project.id}/image`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie },
    body: form1,
  })
  assert.equal(firstRes.status, 200)
  const firstUpdated = await firstRes.json()
  assert.ok(firstUpdated.imageUrl)

  const form2 = new FormData()
  form2.set('image', new Blob([Buffer.from('fake image 2')], { type: 'image/png' }), 'second.png')
  const secondRes = await fetch(`${getBaseUrl()}/projects/${project.id}/image`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie },
    body: form2,
  })
  assert.equal(secondRes.status, 200)
  const secondUpdated = await secondRes.json()
  assert.ok(secondUpdated.imageUrl)
  assert.notEqual(secondUpdated.imageUrl, firstUpdated.imageUrl)

  const deleteRes = await fetch(`${getBaseUrl()}/projects/${project.id}/image`, {
    method: 'DELETE',
    headers: { Cookie: owner.cookie },
  })
  assert.equal(deleteRes.status, 200)
  assert.equal((await deleteRes.json()).imageUrl, null)
})

test('PATCH /projects/:id/image requires membership and an image file', async () => {
  const owner = await createAuthCookie()
  const project = await createManagedProject({
    name: '画像権限テスト',
    imageUrl: null,
    creatorEmail: owner.user.email,
  })
  const stranger = await createAuthCookie()

  const noFile = await fetch(`${getBaseUrl()}/projects/${project.id}/image`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie },
    body: new FormData(),
  })
  assert.equal(noFile.status, 400)

  const form = new FormData()
  form.set('image', new Blob([Buffer.from('fake image')], { type: 'image/png' }), 'photo.png')
  const forbidden = await fetch(`${getBaseUrl()}/projects/${project.id}/image`, {
    method: 'PATCH',
    headers: { Cookie: stranger.cookie },
    body: form,
  })
  assert.equal(forbidden.status, 404)
})
