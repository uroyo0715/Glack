import express from 'express'
import cors from 'cors'
import path from 'node:path'
import reportsRouter from './routes/reports.js'
import authRouter from './routes/auth.js'
import projectsRouter from './routes/projects.js'
import sdkRouter from './routes/sdk.js'

export const app = express()

// セッションCookieを使うため、ワイルドカードではなくオリジンを反映した上で credentials を許可する
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use('/uploads', express.static(path.join(import.meta.dirname, '..', 'uploads')))
app.use('/api/v1', authRouter)
app.use('/api/v1', projectsRouter)
app.use('/api/v1', reportsRouter)
app.use('/api/v1', sdkRouter)

// Express 4はasyncハンドラの例外を自動キャッチしないため、asyncHandler(routes/*.js参照)で
// next(err) に転送された例外はここで受ける。無いと、例外発生時にレスポンスが返らずクライアントが
// ハングし続ける（実際に一度これで結合テストがタイムアウトした）。
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Glank] unhandled error:', err)
  res.status(500).json({ error: 'internal server error' })
})
