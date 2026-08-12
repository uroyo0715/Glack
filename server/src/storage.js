import fs from 'node:fs/promises'
import path from 'node:path'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

// ファイルの保存先を差し替え可能にする薄いラッパー。R2の接続情報（R2_ACCOUNT_ID等）が
// 設定されていればCloudflare R2（S3互換）へ、なければローカルディスクへ保存する。
// どちらの場合もルート側・Unity SDK側の呼び出し方（multipart POST → URLを受け取る）は変わらない。

const UPLOAD_DIR = path.join(import.meta.dirname, '..', 'uploads')

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET
// バケットに紐づけたR2.devの開発用URL、またはカスタムドメイン。末尾の/は付けない。
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

export const usingR2 = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET)

const s3 = usingR2
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
  : null

/**
 * @param {Buffer} buffer
 * @param {string} originalName
 * @returns {Promise<{ url: string }>}
 */
async function saveFile(buffer, originalName) {
  const filename = `${Date.now()}-${originalName}`

  if (usingR2) {
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: filename,
        Body: buffer,
        ContentType: guessContentType(originalName),
      })
    )
    return { url: `${R2_PUBLIC_URL}/${filename}` }
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer)
  return { url: `/uploads/${filename}` }
}

function guessContentType(name) {
  const ext = path.extname(name).toLowerCase()
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  return 'application/octet-stream'
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

/** saveFile()が返したurlに対応するファイルを削除する。無ければ何もしない。 */
export async function deleteFile(url) {
  if (!url) return

  if (usingR2 && R2_PUBLIC_URL && url.startsWith(`${R2_PUBLIC_URL}/`)) {
    const key = url.slice(`${R2_PUBLIC_URL}/`.length)
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => {})
    return
  }

  if (!url.startsWith('/uploads/')) return
  const filePath = path.join(UPLOAD_DIR, url.slice('/uploads/'.length))
  await fs.rm(filePath, { force: true })
}
