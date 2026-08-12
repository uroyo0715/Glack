import fs from 'node:fs/promises'
import path from 'node:path'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

// ファイルの保存先はプロジェクトごとに変わる（storageMode次第でmanaged共有R2 / チーム自前のR2 /
// ローカルディスク）。呼び出し側は server/src/projectDataAccess.js の resolveProjectStorageConfig()
// が返す storageTarget（{ mode: 'r2', config } | { mode: 'local' }）を渡す。

const UPLOAD_DIR = path.join(import.meta.dirname, '..', 'uploads')

// R2クライアントは接続情報ごとにキャッシュする（プロジェクトごとに毎リクエスト作り直さない）。
const s3ClientCache = new Map() // accountId+accessKeyId -> S3Client

function getS3Client(config) {
  const cacheKey = `${config.accountId}:${config.accessKeyId}`
  let client = s3ClientCache.get(cacheKey)
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    })
    s3ClientCache.set(cacheKey, client)
  }
  return client
}

/**
 * @param {{ mode: 'r2', config: object } | { mode: 'local' }} storageTarget
 * @param {Buffer} buffer
 * @param {string} originalName
 * @returns {Promise<{ url: string, bytes: number }>}
 */
async function saveFile(storageTarget, buffer, originalName) {
  const filename = `${Date.now()}-${originalName}`

  if (storageTarget.mode === 'r2') {
    const { config } = storageTarget
    await getS3Client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: filename,
        Body: buffer,
        ContentType: guessContentType(originalName),
      })
    )
    return { url: `${config.publicUrl}/${filename}`, bytes: buffer.length }
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer)
  return { url: `/uploads/${filename}`, bytes: buffer.length }
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

/** @returns {Promise<{ videoUrl: string, bytes: number }>} */
export async function saveVideo(storageTarget, buffer, originalName) {
  const { url, bytes } = await saveFile(storageTarget, buffer, originalName)
  return { videoUrl: url, bytes }
}

/** @returns {Promise<{ imageUrl: string, bytes: number }>} */
export async function saveImage(storageTarget, buffer, originalName) {
  const { url, bytes } = await saveFile(storageTarget, buffer, originalName)
  return { imageUrl: url, bytes }
}

/**
 * saveFile()が返したurlに対応するファイルを削除する。無ければ何もしない。
 * @param {{ mode: 'r2', config: object } | { mode: 'local' }} storageTarget
 */
export async function deleteFile(storageTarget, url) {
  if (!url) return

  if (storageTarget?.mode === 'r2' && url.startsWith(`${storageTarget.config.publicUrl}/`)) {
    const key = url.slice(`${storageTarget.config.publicUrl}/`.length)
    await getS3Client(storageTarget.config)
      .send(new DeleteObjectCommand({ Bucket: storageTarget.config.bucket, Key: key }))
      .catch(() => {})
    return
  }

  if (!url.startsWith('/uploads/')) return
  const filePath = path.join(UPLOAD_DIR, url.slice('/uploads/'.length))
  await fs.rm(filePath, { force: true })
}
