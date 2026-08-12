import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'

// SQLiteファイルを直接コピーすると書き込み中の破損コピーを取ってしまう恐れがあるため、
// `VACUUM INTO` で一貫性のあるスナップショットを作る（書き込みをブロックせず安全に取得できる）。
const BACKUP_DIR = path.join(import.meta.dirname, '..', 'backups')
const RETENTION_COUNT = 14 // 直近14世代だけ残す

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export function runBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const dest = path.join(BACKUP_DIR, `glank-${timestamp()}.sqlite`)
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`)
  pruneOldBackups()
  return dest
}

function pruneOldBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('glank-') && f.endsWith('.sqlite'))
    .sort() // タイムスタンプが名前に含まれるため文字列ソートで時系列になる
  const excess = files.length - RETENTION_COUNT
  for (let i = 0; i < excess; i++) {
    fs.rmSync(path.join(BACKUP_DIR, files[i]), { force: true })
  }
}

/**
 * 起動直後には走らせない。`node --watch` 環境で再起動が続くと、そのたびに
 * バックアップ書き込みが走って余計なファイルI/Oが再起動をさらに誘発しかねないため、
 * 最初の1回も含めて間隔ベースでのみ実行する。
 * @param {number} intervalMs バックアップ間隔（既定6時間）
 */
export function startBackupSchedule(intervalMs = 6 * 60 * 60 * 1000) {
  setInterval(runBackup, intervalMs).unref()
}
