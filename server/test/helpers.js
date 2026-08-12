import { app } from '../src/app.js'
import { createSession } from '../src/auth.js'
import { findOrCreateUser, createProject, setProjectManagedAllowed, updateProjectStorageConfig } from '../src/data.js'

let server
let baseUrl
let userCounter = 0

export async function startServer() {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`
  return baseUrl
}

export async function stopServer() {
  await new Promise((resolve) => server.close(resolve))
}

export function getBaseUrl() {
  return baseUrl
}

/** テスト用ユーザーを作成し、認証済みリクエストに使えるCookie文字列を返す。 */
export async function createAuthCookie(overrides = {}) {
  userCounter += 1
  const user = await findOrCreateUser({
    googleId: overrides.googleId ?? `test-google-id-${userCounter}`,
    email: overrides.email ?? `test${userCounter}@example.com`,
    name: overrides.name ?? `Test User ${userCounter}`,
  })
  const token = await createSession(user.googleId)
  return { cookie: `glank_session=${token}`, user }
}

/**
 * テスト用プロジェクトを作り、即座にmanagedプラン（Glankの共有DB=コントロールプレーンdb自体を
 * バグデータの置き場所として使う）にしておく。新規プロジェクトの既定はself_hostedで、
 * Turso接続情報が無いとバグ関連の操作が一切できないため、bugsを扱うテストはこれを使う。
 */
export async function createManagedProject(overrides = {}) {
  const project = await createProject(overrides)
  await setProjectManagedAllowed(project.id, true)
  await updateProjectStorageConfig(project.id, { storageMode: 'managed' })
  return project
}
