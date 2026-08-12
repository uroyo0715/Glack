import express from 'express'
import crypto from 'node:crypto'
import {
  googleClient,
  GOOGLE_CLIENT_ID,
  GOOGLE_REDIRECT_URI,
  FRONTEND_URL,
  createSession,
  destroySession,
  getSessionToken,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  getOAuthState,
  setOAuthStateCookie,
  clearOAuthStateCookie,
  requireAuth,
  toPublicUser,
} from '../auth.js'
import { findOrCreateUser, updateDisplayName } from '../data.js'
import { asyncHandler } from '../asyncHandler.js'

const router = express.Router()

router.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res
      .status(500)
      .send('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です。server/.env を確認してください。')
  }
  const state = crypto.randomBytes(16).toString('hex')
  setOAuthStateCookie(res, state)
  const url = googleClient.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
  })
  res.redirect(url)
})

router.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query
  if (!code || !state || state !== getOAuthState(req)) {
    return res.status(400).send('OAuthのstateが一致しません。もう一度ログインし直してください。')
  }
  clearOAuthStateCookie(res)

  try {
    const { tokens } = await googleClient.getToken({ code, redirect_uri: GOOGLE_REDIRECT_URI })
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()

    const user = await findOrCreateUser({ googleId: payload.sub, email: payload.email, name: payload.name })
    const token = await createSession(user.googleId)
    setSessionCookie(res, token)
    res.redirect(FRONTEND_URL)
  } catch (err) {
    res.status(500).send(`Googleログインに失敗しました: ${err.message}`)
  }
})

router.post(
  '/auth/logout',
  asyncHandler(async (req, res) => {
    const token = getSessionToken(req)
    if (token) await destroySession(token)
    clearSessionCookie(res)
    res.status(204).end()
  })
)

router.get(
  '/auth/me',
  asyncHandler(async (req, res) => {
    const user = await getSessionUser(req)
    if (!user) return res.status(401).json({ error: 'login required' })
    res.json(toPublicUser(user))
  })
)

router.patch(
  '/auth/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { displayName } = req.body ?? {}
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: 'displayName is required' })
    }
    const updated = await updateDisplayName(req.user.googleId, displayName.trim())
    res.json(toPublicUser(updated))
  })
)

export default router
