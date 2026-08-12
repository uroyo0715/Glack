import { app } from '../src/app.js'
import { createSession } from '../src/auth.js'
import { findOrCreateUser } from '../src/data.js'

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
