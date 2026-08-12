import crypto from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { createSessionRecord, deleteSessionRecord, getUserBySessionToken } from './data.js'
import { asyncHandler } from './asyncHandler.js'

const SESSION_COOKIE = 'glank_session'
const OAUTH_STATE_COOKIE = 'glank_oauth_state'

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8787/api/v1/auth/google/callback'
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173/'

// フロントエンドとバックエンドが別ドメインになる本番(HTTPS)では、Cookieを
// SameSite=None; Secure にしないとクロスサイトのfetchで送られずログインが維持できない。
// ローカル開発(HTTP)では引き続きSameSite=Laxのまま(Secureはhttpだと保存自体されないため)。
const CROSS_SITE_COOKIES = FRONTEND_URL.startsWith('https://')
const SESSION_COOKIE_ATTRS = CROSS_SITE_COOKIES ? 'SameSite=None; Secure' : 'SameSite=Lax'

export const googleClient = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
)

export async function createSession(googleId) {
  const token = crypto.randomBytes(32).toString('hex')
  await createSessionRecord(token, googleId)
  return token
}

export async function destroySession(token) {
  await deleteSessionRecord(token)
}

function parseCookies(req) {
  const header = req.get('Cookie')
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const idx = pair.indexOf('=')
      return [pair.slice(0, idx).trim(), decodeURIComponent(pair.slice(idx + 1).trim())]
    })
  )
}

export function getSessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE]
}

export async function getSessionUser(req) {
  const token = getSessionToken(req)
  if (!token) return null
  return getUserBySessionToken(token)
}

export function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; ${SESSION_COOKIE_ATTRS}; Path=/; Max-Age=${60 * 60 * 24 * 7}`
  )
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; ${SESSION_COOKIE_ATTRS}; Path=/; Max-Age=0`)
}

// OAuth CSRF対策: /auth/google でstateを短命Cookieに保存し、/auth/google/callback で照合する。
export function getOAuthState(req) {
  return parseCookies(req)[OAUTH_STATE_COOKIE]
}

export function setOAuthStateCookie(res, state) {
  res.setHeader(
    'Set-Cookie',
    `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; ${SESSION_COOKIE_ATTRS}; Path=/; Max-Age=600`
  )
}

export function clearOAuthStateCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${OAUTH_STATE_COOKIE}=; HttpOnly; ${SESSION_COOKIE_ATTRS}; Path=/; Max-Age=0`
  )
}

export const requireAuth = asyncHandler(async (req, res, next) => {
  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'login required' })
  req.user = user
  next()
})

export function toPublicUser(user) {
  return { email: user.email, displayName: user.displayName }
}
