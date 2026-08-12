import fs from 'node:fs/promises'
import path from 'node:path'

// ファイルの保存先を差し替え可能にする薄いラッパー。デプロイ先が未確定のため、
// 現状はローカルディスク実装のみ。S3 / Firebase Storage 等に移行する際は
// この saveFile の中身を差し替えるだけでよく、ルート側・Unity SDK側の
// 呼び出し方（multipart POST → URLを受け取る）は変わらない想定。

const UPLOAD_DIR = path.join(import.meta.dirname, '..', 'uploads')

/**
 * @param {Buffer} buffer
 * @param {string} originalName
 * @returns {Promise<{ url: string }>}
 */
async function saveFile(buffer, originalName) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  const filename = `${Date.now()}-${originalName}`
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer)
  return { url: `/uploads/${filename}` }
}

/** @returns {Promise<{ videoUrl: string }>} */
export async function saveVideo(buffer, originalName) {
  const { url } = await saveFile(buffer, originalName)
  return { videoUrl: url }
}

/** @returns {Promise<{ imageUrl: string }>} */
export async function saveImage(buffer, originalName) {
  const { url } = await saveFile(buffer, originalName)
  return { imageUrl: url }
}

/** saveFile()が返したurl（例: /uploads/xxx.mp4）に対応するファイルを削除する。無ければ何もしない。 */
export async function deleteFile(url) {
  if (!url || !url.startsWith('/uploads/')) return
  const filePath = path.join(UPLOAD_DIR, url.slice('/uploads/'.length))
  await fs.rm(filePath, { force: true })
}
