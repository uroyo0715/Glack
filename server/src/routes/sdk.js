import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { ZipArchive } from 'archiver'
import { asyncHandler } from '../asyncHandler.js'

const router = express.Router()

// server/src/routes -> server/src -> server -> リポジトリルート
const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..')

// ヘルプページの「SDK連携の使い方」からダウンロードできるようにする、SDKフォルダの実体。
// unity-sdk/godot-sdkはserver/の外（リポジトリ直下）にあるため、Renderのデプロイが
// リポジトリ全体をクローンしていることが前提（Root Directoryはビルド/起動コマンドの
// 実行場所を変えるだけで、他のフォルダも一緒にクローンされる）。
const SDK_SOURCES = {
  unity: {
    dir: path.join(REPO_ROOT, 'unity-sdk', 'Glank'),
    filename: 'glank-unity-sdk.zip',
  },
  godot: {
    dir: path.join(REPO_ROOT, 'godot-sdk', 'addons', 'glank'),
    filename: 'glank-godot-sdk.zip',
  },
}

router.get(
  '/sdk/:engine',
  asyncHandler(async (req, res) => {
    const source = SDK_SOURCES[req.params.engine]
    if (!source) {
      return res.status(404).json({ error: 'unknown engine' })
    }
    if (!fs.existsSync(source.dir)) {
      return res.status(500).json({ error: 'SDK source not found on server' })
    }

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${source.filename}"`)

    const archive = new ZipArchive({ zlib: { level: 9 } })
    archive.on('error', (err) => {
      // ヘッダーを送信済みのため、エラー時もJSONは返せない。接続を切って諦める。
      console.error('[Glank] sdk zip error:', err)
      res.destroy(err)
    })
    archive.pipe(res)
    archive.directory(source.dir, path.basename(source.dir))
    await archive.finalize()
  })
)

export default router
