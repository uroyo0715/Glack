import { db } from './db.js'

// 種類（tag）に既定のプリセットは無く、全プロジェクト共通のラベル変換テーブルも持たない
// （プロジェクトごとに「選択肢の管理」で追加した項目や自由記述をそのままラベルとして使う）。
export const TAG_LABELS = {}

export const PRIORITY_LABELS = {
  high: '高',
  medium: '中',
  low: '低',
}

// UnityとGodot両方のSDKを提供しているため、どちらを使っているプロジェクトか見分けられる
// ようにするための項目。空文字は「未設定」を表す（この3つのキー以外は不正な値として扱う）。
export const GAME_ENGINE_LABELS = {
  unity: 'Unity',
  godot: 'Godot',
  other: 'その他',
}

export function resolveTagLabel(tag) {
  return TAG_LABELS[tag] ?? tag
}

// GET /reports の assignee クエリパラメータにこの値を渡すと「未割り当て（assignee === ''）」で
// 絞り込む。実際の対応者名と衝突しないよう、通常ありえない予約語にしている
// （フロント側 src/components/FilterBar.jsx の同名の定数と値を合わせること）。
export const UNASSIGNED_FILTER_VALUE = '__unassigned__'

function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : ['未分類']
  } catch {
    return ['未分類']
  }
}

function rowToListItem(row) {
  const tags = parseTags(row.tags)
  return {
    id: Number(row.id),
    projectId: Number(row.projectId),
    title: row.title,
    tags,
    tagLabels: tags.map(resolveTagLabel),
    status: row.status,
    desc: row.description,
    who: row.who,
    assignee: row.assignee ?? '',
    build: row.build,
    platform: row.platform,
    priority: row.priority,
  }
}

async function loadInputs(client, bugId) {
  const { rows } = await client.execute({
    sql: 'SELECT frame, key, label, holdFrames FROM bugInputs WHERE bugId = ? ORDER BY seq',
    args: [bugId],
  })
  return rows.map(({ frame, key, label, holdFrames }) =>
    holdFrames == null
      ? { frame: Number(frame), key, label }
      : { frame: Number(frame), key, label, holdFrames: Number(holdFrames) }
  )
}

async function rowToFullBug(client, row) {
  return {
    ...rowToListItem(row),
    videoUrl: row.videoUrl,
    fps: Number(row.fps),
    durationFrames: Number(row.durationFrames),
    inputs: await loadInputs(client, row.id),
  }
}

// --- バグデータ（bugs/bugInputs）。すべて第1引数に「そのプロジェクトの保存先」の
// @libsql/client を受け取る（managedなら共有DB、self_hostedならチーム自前のDB。
// server/src/projectDataAccess.js の resolveProjectDbClient() で解決する）。

export async function listBugs(
  client,
  { projectId, status, tag, priority, platform, build, who, assignee, q } = {}
) {
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
    sql += ' AND EXISTS (SELECT 1 FROM json_each(bugs.tags) WHERE json_each.value = ?)'
    args.push(tag)
  }
  if (priority) {
    sql += ' AND priority = ?'
    args.push(priority)
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
  if (assignee === UNASSIGNED_FILTER_VALUE) {
    sql += " AND assignee = ''"
  } else if (assignee) {
    sql += ' AND assignee = ?'
    args.push(assignee)
  }
  if (q) {
    sql += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)'
    const needle = `%${String(q).toLowerCase()}%`
    args.push(needle, needle)
  }
  const { rows } = await client.execute({ sql, args })
  return rows.map(rowToListItem)
}

/** カンバン/テーブルの絞り込みUI用に、プロジェクト内で実際に使われているビルド・報告者・対応者・タグの一覧を返す。
 * tagsは「選択肢の管理」で隠していないプリセットに加え、実際の報告で使われた自由記述のタグも
 * ここに出てくるため、絞り込みチップに新しく付けたタグがすぐ反映される。 */
export async function listReportFacets(client, projectId) {
  const [buildsResult, whosResult, assigneesResult, tagsResult] = await Promise.all([
    client.execute({
      sql: "SELECT DISTINCT build FROM bugs WHERE projectId = ? AND build != '' ORDER BY build",
      args: [projectId],
    }),
    client.execute({
      sql: "SELECT DISTINCT who FROM bugs WHERE projectId = ? AND who != '' ORDER BY who",
      args: [projectId],
    }),
    client.execute({
      sql: "SELECT DISTINCT assignee FROM bugs WHERE projectId = ? AND assignee != '' ORDER BY assignee",
      args: [projectId],
    }),
    client.execute({
      sql: `SELECT DISTINCT je.value AS tag FROM bugs, json_each(bugs.tags) je
            WHERE bugs.projectId = ? ORDER BY je.value`,
      args: [projectId],
    }),
  ])
  return {
    builds: buildsResult.rows.map((r) => r.build),
    whos: whosResult.rows.map((r) => r.who),
    assignees: assigneesResult.rows.map((r) => r.assignee),
    tags: tagsResult.rows.map((r) => r.tag),
  }
}

export async function getBugById(client, id) {
  const { rows } = await client.execute({ sql: 'SELECT * FROM bugs WHERE id = ?', args: [id] })
  return rows[0] ? await rowToFullBug(client, rows[0]) : null
}

export async function updateBugStatus(client, id, status) {
  await client.execute({ sql: 'UPDATE bugs SET status = ? WHERE id = ?', args: [status, id] })
  const { rows } = await client.execute({ sql: 'SELECT * FROM bugs WHERE id = ?', args: [id] })
  return rows[0] ? rowToListItem(rows[0]) : null
}

// 動画・入力ログ以外の報告メタデータ（タイトル・ビルドバージョン等）は報告後も編集できる。
// 渡されたフィールドだけを更新する（部分更新）。
export async function updateBugFields(
  client,
  id,
  { title, tags, desc, who, assignee, build, platform, priority } = {}
) {
  const sets = []
  const args = []
  if (title != null) {
    sets.push('title = ?')
    args.push(title)
  }
  if (tags != null) {
    sets.push('tags = ?')
    args.push(JSON.stringify(tags))
  }
  if (desc != null) {
    sets.push('description = ?')
    args.push(desc)
  }
  if (who != null) {
    sets.push('who = ?')
    args.push(who)
  }
  if (assignee != null) {
    sets.push('assignee = ?')
    args.push(assignee)
  }
  if (build != null) {
    sets.push('build = ?')
    args.push(build)
  }
  if (platform != null) {
    sets.push('platform = ?')
    args.push(platform)
  }
  if (priority != null) {
    sets.push('priority = ?')
    args.push(priority)
  }
  if (sets.length > 0) {
    args.push(id)
    await client.execute({ sql: `UPDATE bugs SET ${sets.join(', ')} WHERE id = ?`, args })
  }
  const { rows } = await client.execute({ sql: 'SELECT * FROM bugs WHERE id = ?', args: [id] })
  return rows[0] ? rowToListItem(rows[0]) : null
}

/**
 * Web UIから動画なしで作成した報告に、あとから動画を付け足す/差し替える。
 * 既存の動画ファイル自体の削除は呼び出し側（storage.js）で行う。
 * @returns {Promise<{ previousVideoUrl: string, previousVideoBytes: number }>}
 */
export async function attachBugVideo(client, id, { videoUrl, videoBytes, fps, durationFrames }) {
  const { rows } = await client.execute({
    sql: 'SELECT videoUrl, videoBytes FROM bugs WHERE id = ?',
    args: [id],
  })
  if (!rows[0]) return null
  const previousVideoUrl = rows[0].videoUrl
  const previousVideoBytes = Number(rows[0].videoBytes ?? 0)

  await client.execute({
    sql: 'UPDATE bugs SET videoUrl = ?, videoBytes = ?, fps = ?, durationFrames = ? WHERE id = ?',
    args: [videoUrl, videoBytes ?? 0, fps, durationFrames, id],
  })
  return { previousVideoUrl, previousVideoBytes }
}

/** バグ報告を削除する。存在しなければnullを返す。動画ファイル自体の削除は呼び出し側（storage.js）で行う。 */
export async function deleteBug(client, id) {
  const { rows } = await client.execute({
    sql: 'SELECT videoUrl, videoBytes FROM bugs WHERE id = ?',
    args: [id],
  })
  if (!rows[0]) return null

  const tx = await client.transaction('write')
  try {
    await tx.execute({ sql: 'DELETE FROM bugInputs WHERE bugId = ?', args: [id] })
    await tx.execute({ sql: 'DELETE FROM bugComments WHERE bugId = ?', args: [id] })
    await tx.execute({ sql: 'DELETE FROM bugs WHERE id = ?', args: [id] })
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
  await db.execute({ sql: 'DELETE FROM bugIndex WHERE id = ?', args: [id] })

  return { deletedVideoUrl: rows[0].videoUrl, deletedVideoBytes: Number(rows[0].videoBytes ?? 0) }
}

/**
 * bugのidだけからどのプロジェクト（＝どのDBに問い合わせるべきか）かを調べる。
 * self_hostedプロジェクトのbugs/bugInputsはチーム自前の別DBに置かれ得るため、
 * /reports/:id 系のルートは必ずこれでprojectIdを引いてから resolveProjectDbClient() する。
 * @returns {Promise<number | null>}
 */
export async function resolveBugProjectId(bugId) {
  const { rows } = await db.execute({ sql: 'SELECT projectId FROM bugIndex WHERE id = ?', args: [bugId] })
  return rows[0] ? Number(rows[0].projectId) : null
}

export async function createBug(client, {
  projectId,
  title,
  tags,
  desc,
  who,
  build,
  platform,
  priority,
  videoUrl,
  videoBytes,
  fps,
  durationFrames,
  inputs,
}) {
  // idはコントロールプレーン（db）側で採番する。bugs.idはプロジェクトごとに別DBへ分散し得る
  // ため、「/reports/:id だけでどのDBか分かる」ようにグローバルに一意なidが要る。
  const indexResult = await db.execute({
    sql: 'INSERT INTO bugIndex (projectId) VALUES (?)',
    args: [projectId],
  })
  const bugId = indexResult.lastInsertRowid

  const tx = await client.transaction('write')
  try {
    await tx.execute({
      sql: `INSERT INTO bugs
          (id, projectId, title, tags, status, description, who, build, platform, priority, videoUrl, videoBytes, fps, durationFrames)
         VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        bugId,
        projectId,
        title,
        JSON.stringify(tags),
        desc,
        who,
        build,
        platform,
        priority,
        videoUrl,
        videoBytes ?? 0,
        fps,
        durationFrames,
      ],
    })

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
    await db.execute({ sql: 'DELETE FROM bugIndex WHERE id = ?', args: [bugId] })
    throw err
  }

  return getBugById(client, bugId)
}

/**
 * 指定したプロジェクトの配下のバグ報告・入力ログをまとめて削除する（プロジェクト自体の削除に使う）。
 * @returns {Promise<{ deletedVideoUrls: string[] }>}
 */
export async function deleteAllBugsForProject(client, projectId) {
  const { rows: bugRows } = await client.execute({
    sql: 'SELECT id, videoUrl FROM bugs WHERE projectId = ?',
    args: [projectId],
  })
  const deletedVideoUrls = bugRows.map((r) => r.videoUrl)

  const tx = await client.transaction('write')
  try {
    await tx.execute({
      sql: 'DELETE FROM bugInputs WHERE bugId IN (SELECT id FROM bugs WHERE projectId = ?)',
      args: [projectId],
    })
    await tx.execute({
      sql: 'DELETE FROM bugComments WHERE bugId IN (SELECT id FROM bugs WHERE projectId = ?)',
      args: [projectId],
    })
    await tx.execute({ sql: 'DELETE FROM bugs WHERE projectId = ?', args: [projectId] })
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  for (const bug of bugRows) {
    await db.execute({ sql: 'DELETE FROM bugIndex WHERE id = ?', args: [bug.id] })
  }

  return { deletedVideoUrls }
}

function rowToComment(row) {
  return {
    id: Number(row.id),
    bugId: Number(row.bugId),
    authorEmail: row.authorEmail,
    authorDisplayName: row.authorDisplayName,
    body: row.body,
    createdAt: row.createdAt,
    parentCommentId: row.parentCommentId == null ? null : Number(row.parentCommentId),
  }
}

/** バグ報告のコメント一覧を投稿順に返す（フラットな配列。parentCommentIdで返信関係が分かる。ツリー化はフロント側で行う）。 */
export async function listBugComments(client, bugId) {
  const { rows } = await client.execute({
    sql: 'SELECT * FROM bugComments WHERE bugId = ? ORDER BY id ASC',
    args: [bugId],
  })
  return rows.map(rowToComment)
}

/**
 * バグ報告にコメントを1件追加する。authorEmail/authorDisplayNameは投稿時点のユーザー情報を渡す。
 * parentCommentIdを渡すと、そのコメントへの返信になる（未指定またはnullならトップレベル）。
 * 返信の返信（2階層以上）は作らず、常にトップレベルのコメントに紐づける
 * （返信先自体が既に返信なら、その親＝トップレベルのコメントに付け替える。返信は1段までに揃えるため）。
 * @returns {Promise<object | null>} parentCommentIdが同じbugId配下の既存コメントでなければnull
 */
export async function createBugComment(client, { bugId, authorEmail, authorDisplayName, body, parentCommentId }) {
  let resolvedParentId = parentCommentId ?? null
  if (resolvedParentId != null) {
    const { rows: parentRows } = await client.execute({
      sql: 'SELECT id, parentCommentId FROM bugComments WHERE id = ? AND bugId = ?',
      args: [resolvedParentId, bugId],
    })
    if (!parentRows[0]) return null
    if (parentRows[0].parentCommentId != null) {
      resolvedParentId = Number(parentRows[0].parentCommentId)
    }
  }

  const result = await client.execute({
    sql: `INSERT INTO bugComments (bugId, authorEmail, authorDisplayName, body, createdAt, parentCommentId)
          VALUES (?, ?, ?, ?, datetime('now'), ?)`,
    args: [bugId, authorEmail, authorDisplayName, body, resolvedParentId],
  })
  const { rows } = await client.execute({
    sql: 'SELECT * FROM bugComments WHERE id = ?',
    args: [result.lastInsertRowid],
  })
  return rowToComment(rows[0])
}

/**
 * バグ報告のコメントを1件削除する（そのコメントへの返信も再帰的にまとめて削除する）。
 * 投稿者本人以外は削除できない。
 * @returns {Promise<'deleted' | 'not_found' | 'forbidden'>}
 */
export async function deleteBugComment(client, { bugId, commentId, requesterEmail }) {
  const { rows } = await client.execute({
    sql: 'SELECT authorEmail FROM bugComments WHERE id = ? AND bugId = ?',
    args: [commentId, bugId],
  })
  if (!rows[0]) return 'not_found'
  if (rows[0].authorEmail !== requesterEmail) return 'forbidden'

  await client.execute({
    sql: `WITH RECURSIVE descendants(id) AS (
            SELECT id FROM bugComments WHERE id = ?
            UNION ALL
            SELECT bugComments.id FROM bugComments
            JOIN descendants ON bugComments.parentCommentId = descendants.id
          )
          DELETE FROM bugComments WHERE id IN (SELECT id FROM descendants)`,
    args: [commentId],
  })
  return 'deleted'
}

// --- プロジェクト・ユーザー・セッション（コントロールプレーン）。常にGlank自前のdb（db.js）を使う。

function parseHiddenFieldOptions(raw) {
  try {
    const parsed = JSON.parse(raw ?? '{}')
    return {
      tag: Array.isArray(parsed.tag) ? parsed.tag : [],
      priority: Array.isArray(parsed.priority) ? parsed.priority : [],
      platform: Array.isArray(parsed.platform) ? parsed.platform : [],
    }
  } catch {
    return { tag: [], priority: [], platform: [] }
  }
}

function parseCustomFieldOptions(raw) {
  try {
    const parsed = JSON.parse(raw ?? '{}')
    return {
      tag: Array.isArray(parsed.tag) ? parsed.tag : [],
      platform: Array.isArray(parsed.platform) ? parsed.platform : [],
    }
  } catch {
    return { tag: [], platform: [] }
  }
}

function rowToProject(row) {
  return {
    id: Number(row.id),
    name: row.name,
    imageUrl: row.imageUrl,
    gameEngine: row.gameEngine ?? '',
    bugCount: Number(row.bugCount),
    hiddenFieldOptions: parseHiddenFieldOptions(row.hiddenFieldOptions),
    customFieldOptions: parseCustomFieldOptions(row.customFieldOptions),
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

/** APIレスポンス用の公開シェイプ（bugCountのみ）。storageMode等の内部情報は含めない。 */
export async function getProjectById(id) {
  const { rows } = await db.execute({
    sql: `SELECT p.*, (SELECT COUNT(*) FROM bugs WHERE bugs.projectId = p.id) AS bugCount
          FROM projects p WHERE p.id = ?`,
    args: [id],
  })
  return rows[0] ? rowToProject(rows[0]) : null
}

/**
 * ストレージ接続先の解決・設定API向けに、暗号化済み接続情報を含む生の行を返す内部専用関数。
 * ルート側からそのままレスポンスに使ってはいけない（projectDataAccess.jsのtoStorageStatus()を通すこと）。
 */
export async function getProjectRaw(id) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [id] })
  if (!rows[0]) return null
  const row = rows[0]
  return {
    id: Number(row.id),
    name: row.name,
    imageUrl: row.imageUrl,
    storageMode: row.storageMode,
    isManagedAllowed: Boolean(row.isManagedAllowed),
    tursoConfigEnc: row.tursoConfigEnc,
    r2ConfigEnc: row.r2ConfigEnc,
  }
}

/**
 * self_hosted/managedの切り替えと接続情報（暗号化済み）の保存。
 * 渡さなかったフィールドは変更しない（部分更新）。
 */
export async function updateProjectStorageConfig(
  id,
  { storageMode, tursoConfigEnc, r2ConfigEnc } = {}
) {
  const sets = []
  const args = []
  if (storageMode != null) {
    sets.push('storageMode = ?')
    args.push(storageMode)
  }
  if (tursoConfigEnc !== undefined) {
    sets.push('tursoConfigEnc = ?')
    args.push(tursoConfigEnc)
  }
  if (r2ConfigEnc !== undefined) {
    sets.push('r2ConfigEnc = ?')
    args.push(r2ConfigEnc)
  }
  if (sets.length === 0) return getProjectRaw(id)
  args.push(id)
  await db.execute({ sql: `UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, args })
  return getProjectRaw(id)
}

/**
 * 種類・優先度・プラットフォームのプルダウンで、このプロジェクトでは使わないプリセット項目を
 * 非表示にする設定を保存する。プロジェクトメンバー全員に共通で反映される。
 * @param {{tag?: string[], priority?: string[], platform?: string[]}} hiddenFieldOptions
 */
export async function updateProjectFieldOptions(id, hiddenFieldOptions) {
  const current = await getProjectById(id)
  const merged = {
    ...current.hiddenFieldOptions,
    ...hiddenFieldOptions,
  }
  await db.execute({
    sql: 'UPDATE projects SET hiddenFieldOptions = ? WHERE id = ?',
    args: [JSON.stringify(merged), id],
  })
  return getProjectById(id)
}

const CUSTOM_OPTION_FIELDS = ['tag', 'platform']

/**
 * 種類・プラットフォームに、このプロジェクト独自のプリセット項目を追加する（優先度は固定3段階のため対象外）。
 * 既定プリセットと違い、こちらは追加した本人たちがいつでも削除できる。
 */
export async function addProjectCustomOption(id, field, value) {
  if (!CUSTOM_OPTION_FIELDS.includes(field)) throw new Error(`unknown field: ${field}`)
  const current = await getProjectById(id)
  const list = current.customFieldOptions[field]
  const next = list.includes(value) ? list : [...list, value]
  const merged = { ...current.customFieldOptions, [field]: next }
  await db.execute({
    sql: 'UPDATE projects SET customFieldOptions = ? WHERE id = ?',
    args: [JSON.stringify(merged), id],
  })
  return getProjectById(id)
}

/** このプロジェクトが追加した独自の種類・プラットフォーム項目を削除する。 */
export async function removeProjectCustomOption(id, field, value) {
  if (!CUSTOM_OPTION_FIELDS.includes(field)) throw new Error(`unknown field: ${field}`)
  const current = await getProjectById(id)
  const merged = {
    ...current.customFieldOptions,
    [field]: current.customFieldOptions[field].filter((v) => v !== value),
  }
  await db.execute({
    sql: 'UPDATE projects SET customFieldOptions = ? WHERE id = ?',
    args: [JSON.stringify(merged), id],
  })
  return getProjectById(id)
}

/** managed利用を個別に制限したい場合の手動フラグ（新規プロジェクトは既定でtrue）。
 * 決済機能はまだ無いため手動で切り替える（server/scripts/set-managed-allowed.mjs）。 */
export async function setProjectManagedAllowed(id, allowed) {
  await db.execute({
    sql: 'UPDATE projects SET isManagedAllowed = ? WHERE id = ?',
    args: [allowed ? 1 : 0, id],
  })
  return getProjectRaw(id)
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

// isManagedAllowed=1をデフォルトにしている理由: 元々は複数チームへの有料販売を想定した
// ゲート（チームごとに個別にTurso/R2を持つself_hostedが既定、managedは許可制）だったが、
// 実際には運営者自身のチームで使うことが主目的のため、新規プロジェクトは最初から
// Glank共有のmanagedストレージ（プロジェクトごとのTurso/R2設定が不要）を選べるようにする。
export async function createProject({ name, imageUrl, gameEngine, creatorEmail }) {
  const result = await db.execute({
    sql: 'INSERT INTO projects (name, imageUrl, gameEngine, isManagedAllowed) VALUES (?, ?, ?, 1)',
    args: [name, imageUrl ?? null, gameEngine ?? ''],
  })
  const projectId = result.lastInsertRowid
  await addProjectMembers(projectId, [creatorEmail])
  return getProjectById(projectId)
}

/** ティザー画像を作成後に差し替える/外す。imageUrlにnullを渡すと画像なしに戻す。 */
export async function updateProjectImage(id, imageUrl) {
  await db.execute({
    sql: 'UPDATE projects SET imageUrl = ? WHERE id = ?',
    args: [imageUrl, id],
  })
  return getProjectById(id)
}

/** 使用しているゲームエンジンを作成後に変更する。空文字は「未設定」に戻す。 */
export async function updateProjectGameEngine(id, gameEngine) {
  await db.execute({
    sql: 'UPDATE projects SET gameEngine = ? WHERE id = ?',
    args: [gameEngine, id],
  })
  return getProjectById(id)
}

/** プロジェクト名を作成後に変更する。 */
export async function updateProjectName(id, name) {
  await db.execute({
    sql: 'UPDATE projects SET name = ? WHERE id = ?',
    args: [name, id],
  })
  return getProjectById(id)
}

/**
 * 指定したプロジェクトと、その配下のプロジェクトメンバー行を削除する。
 * バグ報告自体の削除は呼び出し側で resolveProjectDbClient() + deleteAllBugsForProject() を使う
 * （storageMode次第で削除対象のDBが変わるため、ここ（コントロールプレーン側）では扱わない）。
 * @param {number[]} ids
 * @returns {Promise<{ deletedProjectIds: number[] }>}
 */
export async function deleteProjects(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deletedProjectIds: [] }
  }
  const placeholders = ids.map(() => '?').join(',')

  const { rows: existingRows } = await db.execute({
    sql: `SELECT id FROM projects WHERE id IN (${placeholders})`,
    args: ids,
  })
  const existingIds = existingRows.map((r) => Number(r.id))
  if (existingIds.length === 0) {
    return { deletedProjectIds: [] }
  }
  const existingPlaceholders = existingIds.map(() => '?').join(',')

  const tx = await db.transaction('write')
  try {
    await tx.execute({
      sql: `DELETE FROM projectMembers WHERE projectId IN (${existingPlaceholders})`,
      args: existingIds,
    })
    await tx.execute({
      sql: `DELETE FROM managedStorageUsage WHERE projectId IN (${existingPlaceholders})`,
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

  return { deletedProjectIds: existingIds }
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
