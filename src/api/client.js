const BASE_URL = import.meta.env.VITE_API_BASE_URL

/** @returns {Promise<{id: number, name: string, imageUrl: string | null, bugCount: number}[]>} */
export async function fetchProjects() {
  const res = await fetch(`${BASE_URL}/projects`, { credentials: 'include' })
  if (!res.ok) throw new Error(`fetchProjects failed: ${res.status}`)
  return res.json()
}

/** @returns {Promise<{id: number, name: string, imageUrl: string | null}>} */
export async function createProject(name, imageFile) {
  const form = new FormData()
  form.set('name', name)
  if (imageFile) form.set('image', imageFile)
  const res = await fetch(`${BASE_URL}/projects`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `createProject failed: ${res.status}`)
  }
  return res.json()
}

/** @returns {Promise<{deletedProjectIds: number[]}>} */
export async function deleteProjects(ids) {
  const res = await fetch(`${BASE_URL}/projects`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `deleteProjects failed: ${res.status}`)
  }
  return res.json()
}

/** @returns {Promise<{email: string, displayName: string | null}[]>} */
export async function fetchProjectMembers(projectId) {
  const res = await fetch(`${BASE_URL}/projects/${projectId}/members`, { credentials: 'include' })
  if (!res.ok) throw new Error(`fetchProjectMembers failed: ${res.status}`)
  return res.json()
}

/** @returns {Promise<{added: string[], members: {email: string, displayName: string | null}[]}>} */
export async function addProjectMembers(projectId, emails) {
  const res = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ emails }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `addProjectMembers failed: ${res.status}`)
  }
  return res.json()
}

/** @returns {Promise<{members: {email: string, displayName: string | null}[]}>} */
export async function removeProjectMember(projectId, email) {
  const res = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `removeProjectMember failed: ${res.status}`)
  }
  return res.json()
}

/** @returns {Promise<import('./types.js').BugListItem[]>} */
export async function fetchReports(filters = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value != null && value !== '') params.set(key, value)
  }
  const res = await fetch(`${BASE_URL}/reports?${params}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`fetchReports failed: ${res.status}`)
  return res.json()
}

/** @returns {Promise<import('./types.js').Bug>} */
export async function fetchReport(id) {
  const res = await fetch(`${BASE_URL}/reports/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`fetchReport failed: ${res.status}`)
  return res.json()
}

/** @returns {Promise<import('./types.js').BugListItem>} */
export async function updateReportStatus(id, status) {
  const res = await fetch(`${BASE_URL}/reports/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error(`updateReportStatus failed: ${res.status}`)
  return res.json()
}

/** 報告後にタイトル・ビルドバージョン等のメタデータを直すための部分更新。渡したフィールドだけ更新される。
 * @returns {Promise<import('./types.js').BugListItem>} */
export async function updateReportFields(id, fields) {
  const res = await fetch(`${BASE_URL}/reports/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(fields),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `updateReportFields failed: ${res.status}`)
  }
  return res.json()
}

/** バグ報告を削除する（録画・入力ログも含めて完全に削除、取り消し不可）。 */
export async function deleteReport(id) {
  const res = await fetch(`${BASE_URL}/reports/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `deleteReport failed: ${res.status}`)
  }
  return res.json()
}

/** 一覧のビルド/報告者プルダウン用に、プロジェクト内で実際に使われている値を返す。
 * @returns {Promise<{builds: string[], whos: string[]}>} */
export async function fetchReportFacets(projectId) {
  const res = await fetch(`${BASE_URL}/reports/facets?projectId=${projectId}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`fetchReportFacets failed: ${res.status}`)
  return res.json()
}

/** @returns {Promise<import('./types.js').Bug>} */
export async function createManualReport(projectId, fields) {
  const res = await fetch(`${BASE_URL}/reports/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ projectId, ...fields }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `createManualReport failed: ${res.status}`)
  }
  return res.json()
}

// GoogleのOAuth同意画面へブラウザごと遷移させる必要があるため、fetchではなく
// 実際のページ遷移で行う。遷移が起きるのでこのPromiseは意図的に解決しない。
export async function loginWithGoogle() {
  window.location.href = `${BASE_URL}/auth/google`
  return new Promise(() => {})
}

export async function logout() {
  await fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
}

/** @returns {Promise<{email: string, displayName: string} | null>} */
export async function me() {
  const res = await fetch(`${BASE_URL}/auth/me`, { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`me failed: ${res.status}`)
  return res.json()
}

/** @returns {Promise<{email: string, displayName: string}>} */
export async function updateDisplayName(displayName) {
  const res = await fetch(`${BASE_URL}/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ displayName }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `updateDisplayName failed: ${res.status}`)
  }
  return res.json()
}
