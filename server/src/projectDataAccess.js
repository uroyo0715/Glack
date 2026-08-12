import { createClient } from '@libsql/client'
import { db, BUG_TABLES_SCHEMA, migrateFrequencyToPriority, migrateTagToTags } from './db.js'
import { encryptJson, decryptJson } from './crypto.js'

// managedプラン（Glank共有）のR2設定。self_hostedプロジェクトが未設定の間の
// ローカルディスクへの一時保存もここでフォールバックとして扱う（開発用途）。
const MANAGED_R2 = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
  publicUrl: process.env.R2_PUBLIC_URL,
}
const MANAGED_R2_CONFIGURED = Boolean(
  MANAGED_R2.accountId && MANAGED_R2.accessKeyId && MANAGED_R2.secretAccessKey && MANAGED_R2.bucket
)

export const MANAGED_PROJECT_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024 // プロジェクト単位500MB
export const MANAGED_TOTAL_STORAGE_LIMIT_BYTES = 8 * 1024 * 1024 * 1024 // 全体8GB

// self_hostedプロジェクトのTursoクライアントをprojectIdごとにキャッシュする
// （リクエストのたびに新規接続を作らない）。接続情報が更新されたら作り直す。
const clientCache = new Map() // projectId -> { configEnc, client }

function isManagedEffective(project) {
  return project.storageMode === 'managed' && Boolean(project.isManagedAllowed)
}

/**
 * このプロジェクトのバグデータ（bugs/bugInputs）を読み書きすべき@libsql/clientを返す。
 * @returns {Promise<{ ready: true, client: import('@libsql/client').Client } | { ready: false, reason: string }>}
 */
export async function resolveProjectDbClient(project) {
  if (isManagedEffective(project)) {
    return { ready: true, client: db }
  }

  if (!project.tursoConfigEnc) {
    return { ready: false, reason: 'turso_not_configured' }
  }

  const cached = clientCache.get(project.id)
  if (cached && cached.configEnc === project.tursoConfigEnc) {
    return { ready: true, client: cached.client }
  }

  const { url, authToken } = decryptJson(project.tursoConfigEnc)
  const client = createClient({ url, authToken })
  await client.executeMultiple(BUG_TABLES_SCHEMA)
  await migrateFrequencyToPriority(client)
  await migrateTagToTags(client)
  clientCache.set(project.id, { configEnc: project.tursoConfigEnc, client })
  return { ready: true, client }
}

/**
 * このプロジェクトの動画・画像を保存すべきR2設定（またはローカルディスク）を返す。
 * @returns {{ ready: true, mode: 'r2', config: object } | { ready: true, mode: 'local' } | { ready: false, reason: string }}
 */
export function resolveProjectStorageConfig(project) {
  if (isManagedEffective(project)) {
    if (MANAGED_R2_CONFIGURED) return { ready: true, mode: 'r2', config: MANAGED_R2, managed: true }
    return { ready: true, mode: 'local' } // 開発用フォールバック
  }

  if (!project.r2ConfigEnc) {
    return { ready: false, reason: 'r2_not_configured' }
  }
  return { ready: true, mode: 'r2', config: decryptJson(project.r2ConfigEnc), managed: false }
}

/** managedプランの使用量を加算し、上限を超えていないか返す（超えていてもアップロード自体は妨げない。将来のUI表示・警告用）。 */
export async function addManagedStorageUsage(projectId, deltaBytes) {
  await db.execute({
    sql: `INSERT INTO managedStorageUsage (projectId, bytesUsed) VALUES (?, ?)
          ON CONFLICT(projectId) DO UPDATE SET bytesUsed = MAX(0, bytesUsed + ?)`,
    args: [projectId, Math.max(0, deltaBytes), deltaBytes],
  })
}

export async function getManagedStorageUsage(projectId) {
  const { rows } = await db.execute({
    sql: 'SELECT bytesUsed FROM managedStorageUsage WHERE projectId = ?',
    args: [projectId],
  })
  return Number(rows[0]?.bytesUsed ?? 0)
}

export async function getManagedStorageTotalUsage() {
  const { rows } = await db.execute('SELECT COALESCE(SUM(bytesUsed), 0) AS total FROM managedStorageUsage')
  return Number(rows[0].total)
}

/** アップロード前のクォータチェック。managed以外は常にOK（self_hostedはチーム自前の枠なのでGlankは関知しない）。 */
export async function checkManagedStorageQuota(project, incomingBytes) {
  if (!isManagedEffective(project)) return { ok: true }

  const [projectUsage, totalUsage] = await Promise.all([
    getManagedStorageUsage(project.id),
    getManagedStorageTotalUsage(),
  ])
  if (projectUsage + incomingBytes > MANAGED_PROJECT_STORAGE_LIMIT_BYTES) {
    return { ok: false, reason: 'project_quota_exceeded' }
  }
  if (totalUsage + incomingBytes > MANAGED_TOTAL_STORAGE_LIMIT_BYTES) {
    return { ok: false, reason: 'total_quota_exceeded' }
  }
  return { ok: true }
}

/** self_hosted用の接続情報を暗号化して保存用の値にする。呼び出し側でprojects.tursoConfigEncに入れる。 */
export function encryptTursoConfig({ url, authToken }) {
  return encryptJson({ url, authToken })
}

/** @param {{accountId, accessKeyId, secretAccessKey, bucket, publicUrl}} config */
export function encryptR2Config(config) {
  return encryptJson(config)
}

/** 保存済みprojectの行から、フロントに返してよい「設定済みかどうか」のステータスだけを作る（秘密は含めない）。 */
export function toStorageStatus(project) {
  return {
    storageMode: project.storageMode,
    isManagedAllowed: Boolean(project.isManagedAllowed),
    tursoConfigured: Boolean(project.tursoConfigEnc),
    r2Configured: Boolean(project.r2ConfigEnc),
  }
}

/** プロジェクト削除時などにキャッシュを掃除する。 */
export function invalidateProjectDataClientCache(projectId) {
  clientCache.delete(projectId)
}
