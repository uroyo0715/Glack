import { db } from './db.js'

export const TAG_LABELS = {
  crash: 'CRASH',
  visual: 'VISUAL',
  softlock: 'SOFTLOCK',
}

export const FREQUENCY_LABELS = {
  rare: 'まれ',
  sometimes: 'たまに',
  often: '再現しやすい',
  always: '毎回',
  unknown: '再現条件不明',
}

// 種類（tag）はcrash/visual/softlockのプリセットに加えて自由記述も許可する。
// プリセット以外は入力された文字列自体をラベルとしてそのまま使う。
export function resolveTagLabel(tag) {
  return TAG_LABELS[tag] ?? tag
}

function rowToListItem(row) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    tag: row.tag,
    tagLabel: row.tagLabel,
    status: row.status,
    desc: row.description,
    who: row.who,
    build: row.build,
    platform: row.platform,
    frequency: row.frequency,
  }
}

function loadInputs(bugId) {
  return db
    .prepare('SELECT frame, key, label, holdFrames FROM bugInputs WHERE bugId = ? ORDER BY seq')
    .all(bugId)
    .map(({ frame, key, label, holdFrames }) =>
      holdFrames == null ? { frame, key, label } : { frame, key, label, holdFrames }
    )
}

function rowToFullBug(row) {
  return {
    ...rowToListItem(row),
    videoUrl: row.videoUrl,
    fps: row.fps,
    durationFrames: row.durationFrames,
    inputs: loadInputs(row.id),
  }
}

export function listBugs({ projectId, status, tag, platform, build, who, q } = {}) {
  let sql = 'SELECT * FROM bugs WHERE 1=1'
  const params = []
  if (projectId) {
    sql += ' AND projectId = ?'
    params.push(projectId)
  }
  if (status) {
    sql += ' AND status = ?'
    params.push(status)
  }
  if (tag) {
    sql += ' AND tag = ?'
    params.push(tag)
  }
  if (platform) {
    sql += ' AND platform = ?'
    params.push(platform)
  }
  if (build) {
    sql += ' AND build = ?'
    params.push(build)
  }
  if (who) {
    sql += ' AND who = ?'
    params.push(who)
  }
  if (q) {
    sql += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)'
    const needle = `%${String(q).toLowerCase()}%`
    params.push(needle, needle)
  }
  return db
    .prepare(sql)
    .all(...params)
    .map(rowToListItem)
}

/** カンバン/テーブルの絞り込みUI用に、プロジェクト内で実際に使われているビルド・報告者の一覧を返す */
export function listReportFacets(projectId) {
  const builds = db
    .prepare("SELECT DISTINCT build FROM bugs WHERE projectId = ? AND build != '' ORDER BY build")
    .all(projectId)
    .map((r) => r.build)
  const whos = db
    .prepare("SELECT DISTINCT who FROM bugs WHERE projectId = ? AND who != '' ORDER BY who")
    .all(projectId)
    .map((r) => r.who)
  return { builds, whos }
}

export function getBugById(id) {
  const row = db.prepare('SELECT * FROM bugs WHERE id = ?').get(id)
  return row ? rowToFullBug(row) : null
}

export function updateBugStatus(id, status) {
  db.prepare('UPDATE bugs SET status = ? WHERE id = ?').run(status, id)
  const row = db.prepare('SELECT * FROM bugs WHERE id = ?').get(id)
  return row ? rowToListItem(row) : null
}

// 動画・入力ログ以外の報告メタデータ（タイトル・ビルドバージョン等）は報告後も編集できる。
// 渡されたフィールドだけを更新する（部分更新）。
export function updateBugFields(id, { title, tag, desc, who, build, platform, frequency } = {}) {
  const sets = []
  const params = []
  if (title != null) {
    sets.push('title = ?')
    params.push(title)
  }
  if (tag != null) {
    sets.push('tag = ?', 'tagLabel = ?')
    params.push(tag, resolveTagLabel(tag))
  }
  if (desc != null) {
    sets.push('description = ?')
    params.push(desc)
  }
  if (who != null) {
    sets.push('who = ?')
    params.push(who)
  }
  if (build != null) {
    sets.push('build = ?')
    params.push(build)
  }
  if (platform != null) {
    sets.push('platform = ?')
    params.push(platform)
  }
  if (frequency != null) {
    sets.push('frequency = ?')
    params.push(frequency)
  }
  if (sets.length > 0) {
    params.push(id)
    db.prepare(`UPDATE bugs SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }
  const row = db.prepare('SELECT * FROM bugs WHERE id = ?').get(id)
  return row ? rowToListItem(row) : null
}

/** バグ報告を削除する。存在しなければnullを返す。動画ファイル自体の削除は呼び出し側（storage.js）で行う。 */
export function deleteBug(id) {
  const row = db.prepare('SELECT videoUrl FROM bugs WHERE id = ?').get(id)
  if (!row) return null

  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM bugInputs WHERE bugId = ?').run(id)
    db.prepare('DELETE FROM bugs WHERE id = ?').run(id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return { deletedVideoUrl: row.videoUrl }
}

export function createBug({
  projectId,
  title,
  tag,
  tagLabel,
  desc,
  who,
  build,
  platform,
  frequency,
  videoUrl,
  fps,
  durationFrames,
  inputs,
}) {
  db.exec('BEGIN')
  let bugId
  try {
    const result = db
      .prepare(
        `INSERT INTO bugs
          (projectId, title, tag, tagLabel, status, description, who, build, platform, frequency, videoUrl, fps, durationFrames)
         VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        projectId,
        title,
        tag,
        tagLabel,
        desc,
        who,
        build,
        platform,
        frequency,
        videoUrl,
        fps,
        durationFrames
      )

    bugId = result.lastInsertRowid
    const insertInput = db.prepare(
      'INSERT INTO bugInputs (bugId, seq, frame, key, label, holdFrames) VALUES (?, ?, ?, ?, ?, ?)'
    )
    inputs.forEach((input, seq) => {
      insertInput.run(bugId, seq, input.frame, input.key, input.label, input.holdFrames ?? null)
    })
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return getBugById(bugId)
}

function rowToProject(row) {
  return { id: row.id, name: row.name, imageUrl: row.imageUrl, bugCount: row.bugCount }
}

/** ログインしているだけの全ユーザーではなく、そのプロジェクトのメンバーだけが一覧に出す。 */
export function listProjectsForUser(email) {
  return db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM bugs WHERE bugs.projectId = p.id) AS bugCount
       FROM projects p
       JOIN projectMembers m ON m.projectId = p.id
       WHERE m.email = ?
       ORDER BY p.id`
    )
    .all(normalizeEmail(email))
    .map(rowToProject)
}

export function getProjectById(id) {
  const row = db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM bugs WHERE bugs.projectId = p.id) AS bugCount
       FROM projects p WHERE p.id = ?`
    )
    .get(id)
  return row ? rowToProject(row) : null
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase()
}

export function isProjectMember(projectId, email) {
  const row = db
    .prepare('SELECT 1 FROM projectMembers WHERE projectId = ? AND email = ?')
    .get(projectId, normalizeEmail(email))
  return !!row
}

/**
 * メンバー一覧。displayNameはそのemailで一度でもログインしたことがあれば入るが、
 * 招待されただけでまだ一度もログインしていないメンバーはnullになる
 * （フロント側でその場合はemailを表示にフォールバックする）。
 * @returns {{ email: string, displayName: string | null }[]}
 */
export function listProjectMembers(projectId) {
  return db
    .prepare(
      `SELECT pm.email AS email, u.displayName AS displayName
       FROM projectMembers pm
       LEFT JOIN users u ON u.email = pm.email
       WHERE pm.projectId = ?
       ORDER BY pm.addedAt`
    )
    .all(projectId)
}

/** @returns {string[]} 実際に追加された（＝既存メンバーでなかった）メールアドレス */
export function addProjectMembers(projectId, emails) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO projectMembers (projectId, email, addedAt) VALUES (?, ?, ?)'
  )
  const now = new Date().toISOString()
  const added = []
  for (const rawEmail of emails) {
    const email = normalizeEmail(rawEmail)
    if (!email) continue
    const result = insert.run(projectId, email, now)
    if (result.changes > 0) added.push(email)
  }
  return added
}

export function countProjectMembers(projectId) {
  return db.prepare('SELECT COUNT(*) AS n FROM projectMembers WHERE projectId = ?').get(projectId).n
}

/** @returns {boolean} 実際に削除できたか（もともとメンバーでなければfalse） */
export function removeProjectMember(projectId, email) {
  const result = db
    .prepare('DELETE FROM projectMembers WHERE projectId = ? AND email = ?')
    .run(projectId, normalizeEmail(email))
  return result.changes > 0
}

export function createProject({ name, imageUrl, creatorEmail }) {
  const result = db
    .prepare('INSERT INTO projects (name, imageUrl) VALUES (?, ?)')
    .run(name, imageUrl ?? null)
  const projectId = result.lastInsertRowid
  addProjectMembers(projectId, [creatorEmail])
  return getProjectById(projectId)
}

/**
 * 指定したプロジェクトと、その配下のバグ報告・入力ログをまとめて削除する。
 * @param {number[]} ids
 * @returns {{ deletedProjectIds: number[], deletedVideoUrls: string[] }}
 */
export function deleteProjects(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deletedProjectIds: [], deletedVideoUrls: [] }
  }
  const placeholders = ids.map(() => '?').join(',')

  const existingIds = db
    .prepare(`SELECT id FROM projects WHERE id IN (${placeholders})`)
    .all(...ids)
    .map((r) => r.id)
  if (existingIds.length === 0) {
    return { deletedProjectIds: [], deletedVideoUrls: [] }
  }
  const existingPlaceholders = existingIds.map(() => '?').join(',')

  const deletedVideoUrls = db
    .prepare(`SELECT videoUrl FROM bugs WHERE projectId IN (${existingPlaceholders})`)
    .all(...existingIds)
    .map((r) => r.videoUrl)

  db.exec('BEGIN')
  try {
    db.prepare(
      `DELETE FROM bugInputs WHERE bugId IN (SELECT id FROM bugs WHERE projectId IN (${existingPlaceholders}))`
    ).run(...existingIds)
    db.prepare(`DELETE FROM bugs WHERE projectId IN (${existingPlaceholders})`).run(...existingIds)
    db.prepare(`DELETE FROM projectMembers WHERE projectId IN (${existingPlaceholders})`).run(
      ...existingIds
    )
    db.prepare(`DELETE FROM projects WHERE id IN (${existingPlaceholders})`).run(...existingIds)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return { deletedProjectIds: existingIds, deletedVideoUrls }
}

export function findUserByGoogleId(googleId) {
  return db.prepare('SELECT * FROM users WHERE googleId = ?').get(googleId) ?? null
}

/**
 * Googleログインの初回サインイン時にアカウントを自動作成する。
 * displayName は「登録後もいつでも変更できる、表示名としての役割」を持つフィールドで、
 * 初期値はGoogleプロフィールの名前。ログインID自体はgoogleId（不変）で、emailは表示・連絡用の付随情報。
 */
export function findOrCreateUser({ googleId, email, name }) {
  const existing = findUserByGoogleId(googleId)
  if (existing) return existing
  db.prepare('INSERT INTO users (googleId, email, displayName) VALUES (?, ?, ?)').run(
    googleId,
    email,
    name || email
  )
  return findUserByGoogleId(googleId)
}

export function updateDisplayName(googleId, displayName) {
  db.prepare('UPDATE users SET displayName = ? WHERE googleId = ?').run(displayName, googleId)
  return findUserByGoogleId(googleId)
}

export function createSessionRecord(token, googleId) {
  db.prepare('INSERT INTO sessions (token, googleId, createdAt) VALUES (?, ?, ?)').run(
    token,
    googleId,
    new Date().toISOString()
  )
}

export function deleteSessionRecord(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function getUserBySessionToken(token) {
  const row = db
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.googleId = sessions.googleId
       WHERE sessions.token = ?`
    )
    .get(token)
  return row ?? null
}
