import React, { useEffect, useState } from 'react'
import ProjectsPage from './pages/ProjectsPage.jsx'
import BugListPage from './pages/BugListPage.jsx'
import BugDetailPage from './pages/BugDetailPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import HelpPage from './pages/HelpPage.jsx'
import {
  fetchProjects,
  createProject,
  deleteProjects,
  fetchProjectMembers,
  addProjectMembers,
  removeProjectMember,
  fetchProjectStorageStatus,
  updateProjectStorage,
  updateProjectFieldOptions,
  addProjectCustomOption,
  removeProjectCustomOption,
  fetchReports,
  fetchReport,
  fetchReportFacets,
  updateReportStatus,
  updateReportFields,
  deleteReport,
  createManualReport,
  loginWithGoogle,
  logout,
  me,
  updateDisplayName,
} from './api/index.js'
import { STATUS_COLUMNS, PRIORITY_OPTIONS } from './data/mockBugs.js'

const ALL_STATUS = STATUS_COLUMNS.map((s) => s.key)
const ALL_PRIORITIES = PRIORITY_OPTIONS.map((p) => p.key)
// 種類は既定のプリセットを持たずプロジェクトごとに自由なため、status/priorityのように
// 「既知の全キー」を初期値にできない。空配列を「絞り込みなし（すべて表示）」として扱う。
const NO_TAG_FILTER = []

export default function App() {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [projects, setProjects] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState(null)

  const [bugs, setBugs] = useState([])
  const [bugsLoading, setBugsLoading] = useState(true)
  const [bugsError, setBugsError] = useState(null)
  const [bugsLoadedOnce, setBugsLoadedOnce] = useState(false)

  const [storageStatus, setStorageStatus] = useState(null)
  const [storageReloadToken, setStorageReloadToken] = useState(0)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS)
  const [tagFilter, setTagFilter] = useState(NO_TAG_FILTER)
  const [priorityFilter, setPriorityFilter] = useState(ALL_PRIORITIES)
  const [buildFilter, setBuildFilter] = useState('')
  const [whoFilter, setWhoFilter] = useState('')
  const [reportFacets, setReportFacets] = useState({ builds: [], whos: [], tags: [] })
  const [facetsReloadToken, setFacetsReloadToken] = useState(0)

  const [selectedId, setSelectedId] = useState(null)
  const [selectedBug, setSelectedBug] = useState(null)
  const [selectedLoading, setSelectedLoading] = useState(false)
  const [selectedError, setSelectedError] = useState(null)

  const [reloadToken, setReloadToken] = useState(0)
  const [showHelp, setShowHelp] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState(null)

  function toggleStatus(key) {
    setStatusFilter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }
  function toggleTag(key) {
    setTagFilter((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }
  function togglePriority(key) {
    setPriorityFilter((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true))
  }, [])

  function handleGoogleLogin() {
    return loginWithGoogle().then(setUser)
  }

  function handleLogout() {
    logout().then(() => {
      setUser(null)
      setSelectedProjectId(null)
      setSelectedId(null)
    })
  }

  function startEditingName() {
    setNameInput(user.displayName)
    setNameError(null)
    setEditingName(true)
  }

  function saveDisplayName(e) {
    e.preventDefault()
    if (!nameInput.trim()) return
    setNameSaving(true)
    setNameError(null)
    updateDisplayName(nameInput.trim())
      .then((updated) => {
        setUser(updated)
        setEditingName(false)
      })
      .catch((err) => setNameError(err.message ?? String(err)))
      .finally(() => setNameSaving(false))
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setProjectsLoading(true)
    setProjectsError(null)
    fetchProjects()
      .then((result) => {
        if (!cancelled) setProjects(result)
      })
      .catch((err) => {
        if (!cancelled) setProjectsError(err.message ?? String(err))
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, reloadToken])

  function handleCreateProject(name, imageFile) {
    return createProject(name, imageFile).then((project) => {
      setProjects((prev) => [...prev, project])
      return project
    })
  }

  function handleDeleteProjects(ids) {
    return deleteProjects(ids).then((result) => {
      const deleted = new Set(result.deletedProjectIds)
      setProjects((prev) => prev.filter((p) => !deleted.has(p.id)))
      return result
    })
  }

  // self_hostedプロジェクトはTurso未設定の間、報告機能そのものが使えない。ストレージ設定の
  // 状態が分かるまでは一覧取得を待ち、未設定と分かった場合は無駄なAPI呼び出し（どうせ409になる）
  // をせずに空の一覧を出す（BugListPage側がstorageStatusを見てブロック用の案内を表示する）。
  useEffect(() => {
    if (!user || selectedProjectId == null) {
      setStorageStatus(null)
      return
    }
    let cancelled = false
    fetchProjectStorageStatus(selectedProjectId)
      .then((result) => {
        if (!cancelled) setStorageStatus(result)
      })
      .catch(() => {
        if (!cancelled) setStorageStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [user, selectedProjectId, storageReloadToken])

  const storageBlocked =
    storageStatus != null && storageStatus.storageMode === 'self_hosted' && !storageStatus.tursoConfigured

  useEffect(() => {
    if (!user || selectedProjectId == null || storageStatus == null) return
    let cancelled = false

    if (storageBlocked) {
      setBugs([])
      setBugsError(null)
      setBugsLoading(false)
      setBugsLoadedOnce(true)
      return
    }

    setBugsLoading(true)
    setBugsError(null)

    // サーバーのクエリパラメータは単一値のみ対応のため、絞り込みが単一選択の場合
    // だけ status/tag/priority をサーバーに渡す。複数選択時は全件取得してクライアント側で絞る。
    const filters = { projectId: selectedProjectId, q: query.trim() || undefined }
    if (statusFilter.length === 1) filters.status = statusFilter[0]
    if (tagFilter.length === 1) filters.tag = tagFilter[0]
    if (priorityFilter.length === 1) filters.priority = priorityFilter[0]
    if (buildFilter) filters.build = buildFilter
    if (whoFilter) filters.who = whoFilter

    fetchReports(filters)
      .then((result) => {
        if (cancelled) return
        const narrowed = result.filter(
          (b) =>
            statusFilter.includes(b.status) &&
            (tagFilter.length === 0 || b.tags.some((t) => tagFilter.includes(t))) &&
            priorityFilter.includes(b.priority)
        )
        setBugs(narrowed)
      })
      .catch((err) => {
        if (cancelled) return
        setBugsError(err.message ?? String(err))
      })
      .finally(() => {
        if (cancelled) return
        setBugsLoading(false)
        setBugsLoadedOnce(true)
      })

    return () => {
      cancelled = true
    }
  }, [
    user,
    selectedProjectId,
    storageStatus,
    storageBlocked,
    query,
    statusFilter,
    tagFilter,
    priorityFilter,
    buildFilter,
    whoFilter,
    reloadToken,
  ])

  // ビルド/報告者の絞り込みプルダウンの選択肢。テキスト検索だと表記ゆれで検索漏れが
  // 起きやすいため、プロジェクト内で実際に使われている値だけを選ばせる。
  useEffect(() => {
    if (!user || selectedProjectId == null) return
    let cancelled = false
    fetchReportFacets(selectedProjectId)
      .then((result) => {
        if (!cancelled) setReportFacets(result)
      })
      .catch(() => {
        if (!cancelled) setReportFacets({ builds: [], whos: [], tags: [] })
      })
    return () => {
      cancelled = true
    }
  }, [user, selectedProjectId, facetsReloadToken])

  useEffect(() => {
    if (!user || selectedId == null) {
      setSelectedBug(null)
      setSelectedError(null)
      return
    }
    let cancelled = false
    setSelectedLoading(true)
    setSelectedError(null)
    fetchReport(selectedId)
      .then((bug) => {
        if (!cancelled) setSelectedBug(bug)
      })
      .catch((err) => {
        if (!cancelled) setSelectedError(err.message ?? String(err))
      })
      .finally(() => {
        if (!cancelled) setSelectedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, selectedId, reloadToken])

  function updateStatus(id, status) {
    updateReportStatus(id, status).then((updated) => {
      setBugs((prev) => prev.map((b) => (b.id === id ? { ...b, ...updated } : b)))
      setSelectedBug((prev) => (prev && prev.id === id ? { ...prev, status } : prev))
    })
  }

  function handleCreateReport(projectId, fields) {
    return createManualReport(projectId, fields).then((bug) => {
      // bugsはGET /reportsの一覧形状（動画・入力ログを含まない）に揃えておく
      const { videoUrl, fps, durationFrames, inputs, ...listItem } = bug
      setBugs((prev) => [...prev, listItem])
      setFacetsReloadToken((t) => t + 1) // 新しいbuild/whoが選択肢に反映されるように
      return bug
    })
  }

  function handleUpdateReport(id, fields) {
    return updateReportFields(id, fields).then((updated) => {
      setBugs((prev) => prev.map((b) => (b.id === id ? { ...b, ...updated } : b)))
      setSelectedBug((prev) => (prev && prev.id === id ? { ...prev, ...updated } : prev))
      setFacetsReloadToken((t) => t + 1) // build/whoを直した場合に選択肢を更新する
      return updated
    })
  }

  function handleDeleteReport(id) {
    return deleteReport(id).then((result) => {
      setBugs((prev) => prev.filter((b) => b.id !== id))
      setSelectedId(null) // 削除後は一覧に戻る
      setFacetsReloadToken((t) => t + 1) // 削除したbuild/whoが選択肢から消える場合に反映
      return result
    })
  }

  function handleUpdateStorage(projectId, payload) {
    return updateProjectStorage(projectId, payload).then((result) => {
      setStorageStatus(result)
      setStorageReloadToken((t) => t + 1) // 反映を確実にするための再取得トリガー
      return result
    })
  }

  function handleUpdateFieldOptions(projectId, fieldOptions) {
    return updateProjectFieldOptions(projectId, fieldOptions).then((result) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, hiddenFieldOptions: result } : p))
      )
      return result
    })
  }

  function handleAddCustomOption(projectId, field, value) {
    return addProjectCustomOption(projectId, field, value).then((result) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, customFieldOptions: result } : p))
      )
      return result
    })
  }

  function handleRemoveCustomOption(projectId, field, value) {
    return removeProjectCustomOption(projectId, field, value).then((result) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, customFieldOptions: result } : p))
      )
      return result
    })
  }

  function handleRemoveMember(projectId, email) {
    return removeProjectMember(projectId, email).then((result) => {
      const isSelf = user && String(email).trim().toLowerCase() === user.email.trim().toLowerCase()
      if (isSelf) {
        // 自分自身をメンバーから外した場合、このプロジェクトへのアクセスは即座に失われる。
        // 一覧に留まって404を繰り返すのを防ぐため、プロジェクト一覧へ戻す。
        setProjects((prev) => prev.filter((p) => p.id !== Number(projectId)))
        backToProjects()
      }
      return result
    })
  }

  function openProject(id) {
    setSelectedProjectId(id)
    setQuery('')
    setStatusFilter(ALL_STATUS)
    setTagFilter(NO_TAG_FILTER)
    setPriorityFilter(ALL_PRIORITIES)
    setBuildFilter('')
    setWhoFilter('')
    setBugsLoadedOnce(false)
    setStorageStatus(null)
  }

  function backToProjects() {
    setSelectedProjectId(null)
    setSelectedId(null)
  }

  if (!authChecked) {
    return (
      <div className="app-shell">
        <div className="state-panel">読み込み中...</div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage onGoogleLogin={handleGoogleLogin} />
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-dot" />
          <span>Glank</span>
        </div>
        <div className="topbar-right">
          {showHelp ? (
            <button className="back-link" onClick={() => setShowHelp(false)}>
              ← 戻る
            </button>
          ) : selectedId != null ? (
            <button className="back-link" onClick={() => setSelectedId(null)}>
              ← 一覧に戻る
            </button>
          ) : (
            selectedProjectId != null && (
              <button className="back-link" onClick={backToProjects}>
                ← プロジェクト一覧に戻る
              </button>
            )
          )}
          {editingName ? (
            <form className="name-edit-form" onSubmit={saveDisplayName}>
              <input
                className="name-edit-input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                autoFocus
              />
              <button type="submit" className="name-edit-save" disabled={nameSaving}>
                保存
              </button>
              <button type="button" className="name-edit-cancel" onClick={() => setEditingName(false)}>
                取消
              </button>
              {nameError && <span className="name-edit-error">{nameError}</span>}
            </form>
          ) : (
            <button className="current-user" onClick={startEditingName} title="表示名を変更">
              {user.displayName}
            </button>
          )}
          <button className="logout-link" onClick={handleLogout}>
            ログアウト
          </button>
        </div>
      </header>

      {showHelp ? (
        <HelpPage />
      ) : selectedProjectId == null ? (
        projectsLoading ? (
          <div className="state-panel">読み込み中...</div>
        ) : projectsError ? (
          <div className="state-panel state-panel-error">
            <p>プロジェクトの取得に失敗しました: {projectsError}</p>
            <button onClick={() => setReloadToken((t) => t + 1)}>再試行</button>
          </div>
        ) : (
          <ProjectsPage
            projects={projects}
            onOpen={openProject}
            onCreate={handleCreateProject}
            onDelete={handleDeleteProjects}
            onOpenHelp={() => setShowHelp(true)}
          />
        )
      ) : selectedId != null ? (
        selectedLoading ? (
          <div className="state-panel">読み込み中...</div>
        ) : selectedError ? (
          <div className="state-panel state-panel-error">
            <p>報告の取得に失敗しました: {selectedError}</p>
            <button onClick={() => setReloadToken((t) => t + 1)}>再試行</button>
          </div>
        ) : (
          selectedBug && (
            <BugDetailPage
              bug={selectedBug}
              onStatusChange={updateStatus}
              onUpdateReport={handleUpdateReport}
              onDeleteReport={handleDeleteReport}
              buildOptions={reportFacets.builds}
              hiddenFieldOptions={selectedProject?.hiddenFieldOptions}
              customFieldOptions={selectedProject?.customFieldOptions}
              onFetchMembers={fetchProjectMembers}
            />
          )
        )
      ) : !bugsLoadedOnce && bugsLoading ? (
        <div className="state-panel">読み込み中...</div>
      ) : !bugsLoadedOnce && bugsError ? (
        <div className="state-panel state-panel-error">
          <p>一覧の取得に失敗しました: {bugsError}</p>
          <button onClick={() => setReloadToken((t) => t + 1)}>再試行</button>
        </div>
      ) : (
        // 検索・絞り込みの変更のたびにこのコンポーネントを外して読み込み中パネルに差し替えると、
        // BugListPage内部のview（テーブル/カンバン）などの状態がリセットされてしまうため、
        // 初回読み込みが終わったあとは常にマウントしたままにする（更新中はbugsLoadingで内部通知）。
        <BugListPage
          bugs={bugs}
          bugsLoading={bugsLoading}
          bugsError={bugsError}
          onOpen={(id) => setSelectedId(id)}
          projectId={selectedProjectId}
          projectName={selectedProject?.name ?? ''}
          onFetchMembers={fetchProjectMembers}
          onAddMembers={addProjectMembers}
          onRemoveMember={handleRemoveMember}
          onCreateReport={handleCreateReport}
          defaultReporterName={user.displayName}
          storageStatus={storageStatus}
          onFetchStorageStatus={fetchProjectStorageStatus}
          onUpdateStorage={handleUpdateStorage}
          hiddenFieldOptions={selectedProject?.hiddenFieldOptions}
          onUpdateFieldOptions={(patch) => handleUpdateFieldOptions(selectedProjectId, patch)}
          customFieldOptions={selectedProject?.customFieldOptions}
          onAddCustomOption={(field, value) => handleAddCustomOption(selectedProjectId, field, value)}
          onRemoveCustomOption={(field, value) => handleRemoveCustomOption(selectedProjectId, field, value)}
          query={query}
          setQuery={setQuery}
          statusFilter={statusFilter}
          toggleStatus={toggleStatus}
          tagFilter={tagFilter}
          toggleTag={toggleTag}
          priorityFilter={priorityFilter}
          togglePriority={togglePriority}
          buildFilter={buildFilter}
          setBuildFilter={setBuildFilter}
          whoFilter={whoFilter}
          setWhoFilter={setWhoFilter}
          reportFacets={reportFacets}
        />
      )}
    </div>
  )
}
