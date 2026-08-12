import { bugs as seedBugs, TAG_OPTIONS, PRIORITY_OPTIONS } from '../data/mockBugs.js'
import { projects as seedProjects } from '../data/mockProjects.js'

const TAG_LABELS = Object.fromEntries(TAG_OPTIONS.map((t) => [t.key, t.label]))
const PRIORITY_KEYS = new Set(PRIORITY_OPTIONS.map((p) => p.key))
// 種類（tag）はプリセット以外の自由記述も許可する（サーバーのresolveTagLabelと同じ挙動）
const resolveTagLabel = (tag) => TAG_LABELS[tag] ?? tag

// バックエンド未接続時に client.js と同じインターフェースを提供するダミー実装
let bugs = seedBugs.map((b) => ({ ...b }))
let projects = seedProjects.map((p) => ({ ...p }))
let nextProjectId = projects.length + 1
let nextBugId = Math.max(0, ...bugs.map((b) => b.id)) + 1
// projectId -> {email, displayName}[]。モックはユーザーが1人しかいないため実際のアクセス制御はしないが、
// メンバー一覧UIの動作確認はできるようにしておく。招待されただけのメンバーはdisplayName: null
// （実バックエンドで「まだ一度もログインしていない」ケースを模す）。
const membersByProject = new Map(
  projects.map((p) => [p.id, [{ email: 'demo@example.com', displayName: 'デモユーザー' }]])
)

// projectId -> { storageMode, isManagedAllowed, tursoConfigured, r2Configured }。
// シードプロジェクトは最初からmanaged（＝Glankの共有DB相当）で使える状態にしておき、
// 新規作成したプロジェクトは実際のバックエンドと同じくself_hosted・未設定から始まる
// （＝設定するまでバグ関連の操作がブロックされる）。
const storageByProject = new Map(
  projects.map((p) => [
    p.id,
    { storageMode: 'managed', isManagedAllowed: true, tursoConfigured: true, r2Configured: true },
  ])
)

// projectId -> { tag: string[], priority: string[], platform: string[] }。非表示にしたプリセット項目。
const fieldOptionsByProject = new Map(
  projects.map((p) => [p.id, { tag: [], priority: [], platform: [] }])
)

// projectId -> { tag: string[], platform: string[] }。プロジェクト独自の追加項目。
const customFieldOptionsByProject = new Map(projects.map((p) => [p.id, { tag: [], platform: [] }]))

function requireStorageReady(projectId) {
  const status = storageByProject.get(Number(projectId))
  if (!status) return
  const usingManaged = status.storageMode === 'managed' && status.isManagedAllowed
  if (usingManaged) return
  if (!status.tursoConfigured) {
    const err = new Error('database not configured for this project')
    err.code = 'turso_not_configured'
    throw err
  }
}

const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms))

// バックエンド未接続時は実際のGoogle OAuthを行えないため、固定のダミーユーザーで即ログインする。
let currentUser = null

/** @returns {Promise<{email: string, displayName: string}>} */
export async function loginWithGoogle() {
  await delay(300)
  currentUser = { email: 'demo@example.com', displayName: 'デモユーザー' }
  return currentUser
}

export async function logout() {
  await delay(50)
  currentUser = null
}

/** @returns {Promise<{email: string, displayName: string} | null>} */
export async function me() {
  await delay(50)
  return currentUser
}

/** @returns {Promise<{email: string, displayName: string}>} */
export async function updateDisplayName(displayName) {
  await delay(100)
  requireLogin()
  currentUser = { ...currentUser, displayName }
  return currentUser
}

function toListItem({ inputs, videoUrl, fps, durationFrames, ...rest }) {
  return rest
}

function requireLogin() {
  if (!currentUser) throw new Error('login required')
}

/** @returns {Promise<{id: number, name: string, imageUrl: string | null, bugCount: number}[]>} */
export async function fetchProjects() {
  await delay()
  requireLogin()
  return projects.map((p) => ({
    ...p,
    bugCount: bugs.filter((b) => b.projectId === p.id).length,
    hiddenFieldOptions: fieldOptionsByProject.get(p.id) ?? { tag: [], priority: [], platform: [] },
    customFieldOptions: customFieldOptionsByProject.get(p.id) ?? { tag: [], platform: [] },
  }))
}

/** @returns {Promise<{id: number, name: string, imageUrl: string | null}>} */
export async function createProject(name, imageFile) {
  await delay(150)
  requireLogin()
  if (!name || !name.trim()) throw new Error('name is required')
  // ダミー実装ではファイルをどこにも送らずローカルのオブジェクトURLを即席で使う
  const imageUrl = imageFile ? URL.createObjectURL(imageFile) : null
  const project = { id: nextProjectId++, name: name.trim(), imageUrl }
  projects = [...projects, project]
  membersByProject.set(project.id, [{ email: currentUser.email, displayName: currentUser.displayName }])
  storageByProject.set(project.id, {
    storageMode: 'self_hosted',
    isManagedAllowed: false,
    tursoConfigured: false,
    r2Configured: false,
  })
  fieldOptionsByProject.set(project.id, { tag: [], priority: [], platform: [] })
  customFieldOptionsByProject.set(project.id, { tag: [], platform: [] })
  return project
}

/** @returns {Promise<{tag: string[], priority: string[], platform: string[]}>} */
export async function updateProjectFieldOptions(projectId, fieldOptions) {
  await delay(100)
  requireLogin()
  const id = Number(projectId)
  const current = fieldOptionsByProject.get(id) ?? { tag: [], priority: [], platform: [] }
  const next = { ...current, ...fieldOptions }
  fieldOptionsByProject.set(id, next)
  return next
}

const CUSTOM_OPTION_FIELDS = ['tag', 'platform']

/** @returns {Promise<{tag: string[], platform: string[]}>} */
export async function addProjectCustomOption(projectId, field, value) {
  await delay(100)
  requireLogin()
  if (!CUSTOM_OPTION_FIELDS.includes(field)) throw new Error(`unknown field: ${field}`)
  const id = Number(projectId)
  const current = customFieldOptionsByProject.get(id) ?? { tag: [], platform: [] }
  const list = current[field]
  const next = { ...current, [field]: list.includes(value) ? list : [...list, value] }
  customFieldOptionsByProject.set(id, next)
  return next
}

/** @returns {Promise<{tag: string[], platform: string[]}>} */
export async function removeProjectCustomOption(projectId, field, value) {
  await delay(100)
  requireLogin()
  if (!CUSTOM_OPTION_FIELDS.includes(field)) throw new Error(`unknown field: ${field}`)
  const id = Number(projectId)
  const current = customFieldOptionsByProject.get(id) ?? { tag: [], platform: [] }
  const next = { ...current, [field]: current[field].filter((v) => v !== value) }
  customFieldOptionsByProject.set(id, next)
  return next
}

/** @returns {Promise<{storageMode: 'self_hosted' | 'managed', isManagedAllowed: boolean, tursoConfigured: boolean, r2Configured: boolean}>} */
export async function fetchProjectStorageStatus(projectId) {
  await delay(80)
  requireLogin()
  return { ...storageByProject.get(Number(projectId)) }
}

/** @returns {Promise<{storageMode, isManagedAllowed, tursoConfigured, r2Configured}>} */
export async function updateProjectStorage(projectId, { storageMode, turso, r2 } = {}) {
  await delay(150)
  requireLogin()
  const id = Number(projectId)
  const current = storageByProject.get(id)
  if (!current) throw new Error(`updateProjectStorage: unknown project ${projectId}`)

  if (storageMode != null) {
    if (storageMode !== 'self_hosted' && storageMode !== 'managed') {
      throw new Error(`unknown storageMode: ${storageMode}`)
    }
    if (storageMode === 'managed' && !current.isManagedAllowed) {
      throw new Error('managed plan is not enabled for this project')
    }
    current.storageMode = storageMode
  }
  if (turso != null) {
    if (!turso.url || !turso.authToken) throw new Error('turso.url and turso.authToken are required')
    current.tursoConfigured = true
  }
  if (r2 != null) {
    const required = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket', 'publicUrl']
    const missing = required.filter((key) => !r2[key])
    if (missing.length > 0) throw new Error(`r2 missing fields: ${missing.join(', ')}`)
    current.r2Configured = true
  }
  storageByProject.set(id, current)
  return { ...current }
}

/** @returns {Promise<{email: string, displayName: string | null}[]>} */
export async function fetchProjectMembers(projectId) {
  await delay(100)
  requireLogin()
  return membersByProject.get(Number(projectId)) ?? []
}

/** @returns {Promise<{added: string[], members: {email: string, displayName: string | null}[]}>} */
export async function addProjectMembers(projectId, emails) {
  await delay(150)
  requireLogin()
  const id = Number(projectId)
  const current = membersByProject.get(id) ?? []
  const existingEmails = new Set(current.map((m) => m.email))
  const added = []
  for (const raw of emails) {
    const email = String(raw).trim().toLowerCase()
    if (!email || existingEmails.has(email)) continue
    existingEmails.add(email)
    added.push(email)
    current.push({ email, displayName: null }) // モックでは招待されただけの人はまだログインしていない扱い
  }
  membersByProject.set(id, current)
  return { added, members: current }
}

/** @returns {Promise<{members: {email: string, displayName: string | null}[]}>} */
export async function removeProjectMember(projectId, email) {
  await delay(100)
  requireLogin()
  const id = Number(projectId)
  const target = String(email).trim().toLowerCase()
  const current = membersByProject.get(id) ?? []
  if (current.length <= 1) throw new Error('cannot remove the last member of a project')
  const next = current.filter((m) => m.email !== target)
  membersByProject.set(id, next)
  return { members: next }
}

/** @returns {Promise<{deletedProjectIds: number[]}>} */
export async function deleteProjects(ids) {
  await delay(150)
  requireLogin()
  const idSet = new Set(ids.map(Number))
  const deletedProjectIds = projects.filter((p) => idSet.has(p.id)).map((p) => p.id)
  projects = projects.filter((p) => !idSet.has(p.id))
  bugs = bugs.filter((b) => !idSet.has(b.projectId))
  deletedProjectIds.forEach((id) => {
    membersByProject.delete(id)
    storageByProject.delete(id)
    fieldOptionsByProject.delete(id)
    customFieldOptionsByProject.delete(id)
  })
  return { deletedProjectIds }
}

/** @returns {Promise<import('./types.js').BugListItem[]>} */
export async function fetchReports(filters = {}) {
  await delay()
  requireLogin()
  if (filters.projectId) requireStorageReady(filters.projectId)
  let result = bugs
  if (filters.projectId) result = result.filter((b) => b.projectId === Number(filters.projectId))
  if (filters.status) result = result.filter((b) => b.status === filters.status)
  if (filters.tag) result = result.filter((b) => b.tags.includes(filters.tag))
  if (filters.platform) result = result.filter((b) => b.platform === filters.platform)
  if (filters.build) result = result.filter((b) => b.build === filters.build)
  if (filters.who) result = result.filter((b) => b.who === filters.who)
  if (filters.q) {
    const q = filters.q.toLowerCase()
    result = result.filter(
      (b) => b.title.toLowerCase().includes(q) || b.desc.toLowerCase().includes(q)
    )
  }
  return result.map(toListItem)
}

/** 一覧のビルド/報告者プルダウン用に、プロジェクト内で実際に使われている値を返す。
 * @returns {Promise<{builds: string[], whos: string[]}>} */
export async function fetchReportFacets(projectId) {
  await delay(80)
  requireLogin()
  requireStorageReady(projectId)
  const projectBugs = bugs.filter((b) => b.projectId === Number(projectId))
  const builds = [...new Set(projectBugs.map((b) => b.build).filter(Boolean))].sort()
  const whos = [...new Set(projectBugs.map((b) => b.who).filter(Boolean))].sort()
  return { builds, whos }
}

/** @returns {Promise<import('./types.js').Bug>} */
export async function createManualReport(projectId, fields) {
  await delay(150)
  requireLogin()
  requireStorageReady(projectId)
  const required = ['title', 'desc', 'who', 'build', 'platform']
  const missing = required.filter((key) => !fields[key])
  if (missing.length > 0) throw new Error(`missing fields: ${missing.join(', ')}`)
  if (!Array.isArray(fields.tags) || fields.tags.length === 0) {
    throw new Error('tags must be a non-empty array of strings')
  }
  const priority = fields.priority || 'medium'
  if (!PRIORITY_KEYS.has(priority)) throw new Error(`unknown priority: ${priority}`)

  const bug = {
    id: nextBugId++,
    projectId: Number(projectId),
    title: fields.title,
    tags: fields.tags,
    tagLabels: fields.tags.map(resolveTagLabel),
    status: 'todo',
    desc: fields.desc,
    who: fields.who,
    build: fields.build,
    platform: fields.platform,
    priority,
    videoUrl: '',
    fps: 0,
    durationFrames: 0,
    inputs: [],
  }
  bugs = [...bugs, bug]
  return bug
}

/** @returns {Promise<import('./types.js').Bug>} */
export async function fetchReport(id) {
  await delay()
  requireLogin()
  const bug = bugs.find((b) => String(b.id) === String(id))
  if (!bug) throw new Error(`fetchReport: not found (${id})`)
  return bug
}

/** @returns {Promise<import('./types.js').BugListItem>} */
export async function updateReportStatus(id, status) {
  await delay(100)
  requireLogin()
  bugs = bugs.map((b) => (String(b.id) === String(id) ? { ...b, status } : b))
  return toListItem(bugs.find((b) => String(b.id) === String(id)))
}

const EDITABLE_TEXT_FIELDS = ['title', 'desc', 'who', 'build', 'platform']

/** 報告後にタイトル・ビルドバージョン等のメタデータを直すための部分更新。渡したフィールドだけ更新される。
 * @returns {Promise<import('./types.js').BugListItem>} */
export async function updateReportFields(id, fields) {
  await delay(100)
  requireLogin()
  const emptyField = EDITABLE_TEXT_FIELDS.find((key) => fields[key] === '')
  if (emptyField) throw new Error(`${emptyField} cannot be empty`)
  if (fields.tags != null && (!Array.isArray(fields.tags) || fields.tags.length === 0)) {
    throw new Error('tags must be a non-empty array of strings')
  }
  if (fields.priority != null && !PRIORITY_KEYS.has(fields.priority)) {
    throw new Error(`unknown priority: ${fields.priority}`)
  }

  const patch = { ...fields }
  if (patch.tags != null) patch.tagLabels = patch.tags.map(resolveTagLabel)
  bugs = bugs.map((b) => (String(b.id) === String(id) ? { ...b, ...patch } : b))
  return toListItem(bugs.find((b) => String(b.id) === String(id)))
}

/** バグ報告を削除する（録画・入力ログも含めて完全に削除、取り消し不可）。 */
export async function deleteReport(id) {
  await delay(150)
  requireLogin()
  const exists = bugs.some((b) => String(b.id) === String(id))
  if (!exists) throw new Error(`deleteReport: not found (${id})`)
  bugs = bugs.filter((b) => String(b.id) !== String(id))
  return { deleted: true }
}
