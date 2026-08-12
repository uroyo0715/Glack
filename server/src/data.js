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
    id: Number(row.id),
    projectId: Number(row.projectId),
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

async function loadInputs(bugId) {
  const { rows } = await db.execute({
    sql: 'SELECT frame, key, label, holdFrames FROM bugInputs WHERE bugId = ? ORDER BY seq',
    args: [bugId],
  })
  return rows.map(({ frame, key, label, holdFrames }) =>
    holdFrames == null
      ? { frame: Number(frame), key, label }
      : { frame: Number(frame), key, label, holdFrames: Number(holdFrames) }
  )
}

async function rowToFullBug(row) {
  return {
    ...rowToListItem(row),
    videoUrl: row.videoUrl,
    fps: Number(row.fps),
    durationFrames: Number(row.durationFrames),
    inputs: await loadInputs(row.id),
  }
}

export async function listBugs({ projectId, status, tag, platform, build, who, q } = {}) {
  let sql = 'SELECT * FROM bugs WHERE 1=1'
  const args = []
  if (projectId) {
    sql += ' AND projectId = ?'
    args.push(projectId)
  }
  if (status) {
    sql += ' AND status = ?'
    args.push(status)
  }
  if (tag) {
    sql += ' AND tag = ?'
    args.push(tag)
  }
  if (platform) {
    sql += ' AND platform = ?'
    args.push(platform)
  }
  if (build) {
    sql += ' AND build = ?'
    args.push(build)
  }
  if (who) {
    sql += ' AND who = ?'
    args.push(who)
  }
  if (q) {
    sql += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)'
    const needle = `%${String(q).toLowerCase()}%`
    args.push(needle, needle)
  }
  const { rows } = await db.execute({ sql, args })
  return rows.map(rowToListItem)
}

/** カンバン/テーブルの絞り込みUI用に、プロジェクト内で実際に使われているビルド・報告者の一覧を返す */
export async function listReportFacets(projectId) {
  const [buildsResult, whosResult] = await Promise.all([
    db.execute({
      sql: "SELECT DISTINCT build FROM bugs WHERE projectId = ? AND build != '' ORDER BY build",
      args: [projectId],
    }),
    db.execute({
      sql: "SELECT DISTINCT who FROM bugs WHERE projectId = ? AND who != '' ORDER BY who",
      args: [projectId],
    }),
  ])
  return {
    builds: buildsResult.rows.map((r) => r.build),
    whos: whosResult.rows.map((r) => r.who),
  }
}

export async function getBugById(id) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM bugs WHERE id = ?', args: [id] })
  return rows[0] ? await rowToFullBug(rows[0]) : null
}

export async function updateBugStatus(id, status) {
  await db.execute({ sql: 'UPDATE bugs SET status = ? WHERE id = ?', args: [status, id] })
  const { rows } = await db.execute({ sql: 'SELECT * FROM bugs WHERE id = ?', args: [id] })
  return rows[0] ? rowToListItem(rows[0]) : null
}

// 動画・入力ログ以外の報告メタデータ（タイトル・ビルドバージョン等）は報告後も編集できる。
// 渡されたフィールドだけを更新する（部分更新）。
export async function updateBugFields(id, { title, tag, desc, who, build, platform, frequency } = {}) {
  const sets = []
  const args = []
  if (title != null) {
    sets.push('title = ?')
    args.push(title)
  }
  if (tag != null) {
    sets.push('tag = ?', 'tagLabel = ?')
    args.push(tag, resolveTagLabel(tag))
  }
  if (desc != null) {
    sets.push('description = ?')
    args.push(desc)
  }
  if (who != null) {
    sets.push('who = ?')
    args.push(who)
  }
  if (build != null) {
    sets.push('build = ?')
    args.push(build)
  }
  if (platform != null) {
    sets.push('platform = ?')
    args.push(platform)
  }
  if (frequency != null) {
    sets.push('frequency = ?')
    args.push(frequency)
  }
  if (sets.length > 0) {
    args.push(id)
    await db.execute({ sql: `UPDATE bugs SET ${sets.join(', ')} WHERE id = ?`, args })
  }
  const { rows } = await db.execute({ sql: 'SELECT * FROM bugs WHERE id = ?', args: [id] })
  return rows[0] ? rowToListItem(rows[0]) : null
}

/** バグ報告を削除する。存在しなければnullを返す。動画ファイル自体の削除は呼び出し側（storage.js）で行う。 */
export async function deleteBug(id) {
  const { rows } = await db.execute({ sql: 'SELECT videoUrl FROM bugs WHERE id = ?', args: [id] })
  if (!rows[0]) return null

  const tx = await db.transaction('write')
  try {
    await tx.execute({ sql: 'DELETE FROM bugInputs WHERE bugId = ?', args: [id] })
    await tx.execute({ sql: 'DELETE FROM bugs WHERE id = ?', args: [id] })
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  return { deletedVideoUrl: rows[0].videoUrl }
}

export async function createBug({
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
  const tx = await db.transaction('write')
  let bugId
  try {
    const result = await tx.execute({
      sql: `INSERT INTO bugs
          (projectId, title, tag, tagLabel, status, description, who, build, platform, frequency, videoUrl, fps, durationFrames)
         VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [projectId, title, tag, tagLabel, desc, who, build, platform, frequency, videoUrl, fps, durationFrames],
    })
    bugId = result.lastInsertRowid

    let seq = 0
    for (const input of inputs) {
      await tx.execute({
        sql: 'INSERT INTO bugInputs (bugId, seq, frame, key, label, holdFrames) VALUES (?, ?, ?, ?, ?, ?)',
        args: [bugId, seq, input.frame, input.key, input.label, input.holdFrames ?? null],
      })
      seq += 1
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  return getBugById(bugId)
}

function rowToProject(row) {
  return {
    id: Number(row.id),
    name: row.name,
    imageUrl: row.imageUrl,
    bugCount: Number(row.bugCount),
  }
}

/** ログインしているだけの全ユーザーではなく、そのプロジェクトのメンバーだけが一覧に出す。 */
export async function listProjectsForUser(email) {
  const { rows } = await db.execute({
    sql: `SELECT p.*, (SELECT COUNT(*) FROM bugs WHERE bugs.projectId = p.id) AS bugCount
          FROM projects p
          JOIN projectMembers m ON m.projectId = p.id
          WHERE m.email = ?
          ORDER BY p.id`,
    args: [normalizeEmail(email)],
  })
  return rows.map(rowToProject)
}

export async function getProjectById(id) {
  const { rows } = await db.execute({
    sql: `SELECT p.*, (SELECT COUNT(*) FROM bugs WHERE bugs.projectId = p.id) AS bugCount
          FROM projects p WHERE p.id = ?`,
    args: [id],
  })
  return rows[0] ? rowToProject(rows[0]) : null
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase()
}

export async function isProjectMember(projectId, email) {
  const { rows } = await db.execute({
    sql: 'SELECT 1 FROM projectMembers WHERE projectId = ? AND email = ?',
    args: [projectId, normalizeEmail(email)],
  })
  return rows.length > 0
}

/**
 * メンバー一覧。displayNameはそのemailで一度でもログインしたことがあれば入るが、
 * 招待されただけでまだ一度もログインしていないメンバーはnullになる
 * （フロント側でその場合はemailを表示にフォールバックする）。
 * @returns {Promise<{ email: string, displayName: string | null }[]>}
 */
export async function listProjectMembers(projectId) {
  const { rows } = await db.execute({
    sql: `SELECT pm.email AS email, u.displayName AS displayName
          FROM projectMembers pm
          LEFT JOIN users u ON u.email = pm.email
          WHERE pm.projectId = ?
          ORDER BY pm.addedAt`,
    args: [projectId],
  })
  return rows.map((r) => ({ email: r.email, displayName: r.displayName }))
}

/** @returns {Promise<string[]>} 実際に追加された（＝既存メンバーでなかった）メールアドレス */
export async function addProjectMembers(projectId, emails) {
  const now = new Date().toISOString()
  const added = []
  for (const rawEmail of emails) {
    const email = normalizeEmail(rawEmail)
    if (!email) continue
    const result = await db.execute({
      sql: 'INSERT OR IGNORE INTO projectMembers (projectId, email, addedAt) VALUES (?, ?, ?)',
      args: [projectId, email, now],
    })
    if (result.rowsAffected > 0) added.push(email)
  }
  return added
}

export async function countProjectMembers(projectId) {
  const { rows } = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM projectMembers WHERE projectId = ?',
    args: [projectId],
  })
  return Number(rows[0].n)
}

/** @returns {Promise<boolean>} 実際に削除できたか（もともとメンバーでなければfalse） */
export async function removeProjectMember(projectId, email) {
  const result = await db.execute({
    sql: 'DELETE FROM projectMembers WHERE projectId = ? AND email = ?',
    args: [projectId, normalizeEmail(email)],
  })
  return result.rowsAffected > 0
}

export async function createProject({ name, imageUrl, creatorEmail }) {
  const result = await db.execute({
    sql: 'INSERT INTO projects (name, imageUrl) VALUES (?, ?)',
    args: [name, imageUrl ?? null],
  })
  const projectId = result.lastInsertRowid
  await addProjectMembers(projectId, [creatorEmail])
  return getProjectById(projectId)
}

/**
 * 指定したプロジェクトと、その配下のバグ報告・入力ログをまとめて削除する。
 * @param {number[]} ids
 * @returns {Promise<{ deletedProjectIds: number[], deletedVideoUrls: string[] }>}
 */
export async function deleteProjects(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deletedProjectIds: [], deletedVideoUrls: [] }
  }
  const placeholders = ids.map(() => '?').join(',')

  const { rows: existingRows } = await db.execute({
    sql: `SELECT id FROM projects WHERE id IN (${placeholders})`,
    args: ids,
  })
  const existingIds = existingRows.map((r) => Number(r.id))
  if (existingIds.length === 0) {
    return { deletedProjectIds: [], deletedVideoUrls: [] }
  }
  const existingPlaceholders = existingIds.map(() => '?').join(',')

  const { rows: videoRows } = await db.execute({
    sql: `SELECT videoUrl FROM bugs WHERE projectId IN (${existingPlaceholders})`,
    args: existingIds,
  })
  const deletedVideoUrls = videoRows.map((r) => r.videoUrl)

  const tx = await db.transaction('write')
  try {
    await tx.execute({
      sql: `DELETE FROM bugInputs WHERE bugId IN (SELECT id FROM bugs WHERE projectId IN (${existingPlaceholders}))`,
      args: existingIds,
    })
    await tx.execute({
      sql: `DELETE FROM bugs WHERE projectId IN (${existingPlaceholders})`,
      args: existingIds,
    })
    await tx.execute({
      sql: `DELETE FROM projectMembers WHERE projectId IN (${existingPlaceholders})`,
      args: existingIds,
    })
    await tx.execute({
      sql: `DELETE FROM projects WHERE id IN (${existingPlaceholders})`,
      args: existingIds,
    })
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  return { deletedProjectIds: existingIds, deletedVideoUrls }
}

export async function findUserByGoogleId(googleId) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM users WHERE googleId = ?', args: [googleId] })
  return rows[0] ?? null
}

/**
 * Googleログインの初回サインイン時にアカウントを自動作成する。
 * displayName は「登録後もいつでも変更できる、表示名としての役割」を持つフィールドで、
 * 初期値はGoogleプロフィールの名前。ログインID自体はgoogleId（不変）で、emailは表示・連絡用の付随情報。
 */
export async function findOrCreateUser({ googleId, email, name }) {
  const existing = await findUserByGoogleId(googleId)
  if (existing) return existing
  await db.execute({
    sql: 'INSERT INTO users (googleId, email, displayName) VALUES (?, ?, ?)',
    args: [googleId, email, name || email],
  })
  return findUserByGoogleId(googleId)
}

export async function updateDisplayName(googleId, displayName) {
  await db.execute({
    sql: 'UPDATE users SET displayName = ? WHERE googleId = ?',
    args: [displayName, googleId],
  })
  return findUserByGoogleId(googleId)
}

export async function createSessionRecord(token, googleId) {
  await db.execute({
    sql: 'INSERT INTO sessions (token, googleId, createdAt) VALUES (?, ?, ?)',
    args: [token, googleId, new Date().toISOString()],
  })
}

export async function deleteSessionRecord(token) {
  await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] })
}

export async function getUserBySessionToken(token) {
  const { rows } = await db.execute({
    sql: `SELECT users.* FROM sessions
          JOIN users ON users.googleId = sessions.googleId
          WHERE sessions.token = ?`,
    args: [token],
  })
  return rows[0] ?? null
}
