import crypto from 'node:crypto'

// self_hostedプロジェクトが入力するTurso/R2の接続情報（Turso認証トークン、R2シークレットキー等）を
// 平文でDBに保存しないためのAES-256-GCM暗号化。鍵は環境変数 GLANK_ENCRYPTION_KEY
// （32byteをbase64化した文字列）から取る。
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM推奨の96bit
const AUTH_TAG_LENGTH = 16

function getKey() {
  const raw = process.env.GLANK_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'GLANK_ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('GLANK_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes')
  }
  return key
}

/** 任意のJSON化可能な値を暗号化し、DBに保存できる1本の文字列（base64）にする。 */
export function encryptJson(value) {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

/** encryptJson()の逆変換。 */
export function decryptJson(encoded) {
  const key = getKey()
  const buf = Buffer.from(encoded, 'base64')
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plaintext.toString('utf8'))
}
