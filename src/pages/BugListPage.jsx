import React, { useState } from 'react'
import { STATUS_COLUMNS, PRIORITY_OPTIONS } from '../data/mockBugs.js'
import FilterBar from '../components/FilterBar.jsx'
import MembersPanel from '../components/MembersPanel.jsx'
import NewReportForm from '../components/NewReportForm.jsx'
import StorageSettingsPanel from '../components/StorageSettingsPanel.jsx'
import FieldOptionsPanel from '../components/FieldOptionsPanel.jsx'
import SegmentedToggle from '../components/SegmentedToggle.jsx'

function statusLabel(key) {
  return STATUS_COLUMNS.find((s) => s.key === key)?.label ?? key
}

function priorityLabel(key) {
  return PRIORITY_OPTIONS.find((p) => p.key === key)?.label ?? key
}

export default function BugListPage({
  bugs,
  bugsLoading,
  bugsError,
  onOpen,
  projectId,
  projectName,
  onFetchMembers,
  onAddMembers,
  onRemoveMember,
  onOpenHelp,
  onCreateReport,
  defaultReporterName,
  storageStatus,
  onFetchStorageStatus,
  onUpdateStorage,
  hiddenFieldOptions,
  onUpdateFieldOptions,
  customFieldOptions,
  onAddCustomOption,
  onRemoveCustomOption,
  query,
  setQuery,
  statusFilter,
  toggleStatus,
  tagFilter,
  toggleTag,
  priorityFilter,
  togglePriority,
  buildFilter,
  setBuildFilter,
  whoFilter,
  setWhoFilter,
  assigneeFilter,
  setAssigneeFilter,
  reportFacets,
}) {
  const [view, setView] = useState('table') // 'table' | 'kanban'
  const [showMembers, setShowMembers] = useState(false)
  const [showNewReport, setShowNewReport] = useState(false)
  const [showStorage, setShowStorage] = useState(false)
  const [showFieldOptions, setShowFieldOptions] = useState(false)

  // 絞り込みは App.jsx が fetchReports() 呼び出し時にサーバー側（クエリパラメータ）で行う。
  // ここでは取得済みの bugs をそのまま表示する。
  const filtered = bugs
  // ステータスの絞り込みで外されたタブはボード表示でも列ごと非表示にする（カードだけでなく）。
  const visibleStatusColumns = STATUS_COLUMNS.filter((col) => statusFilter.includes(col.key))

  // self_hostedでTurso未設定の間は、報告機能そのものが使えない（要件）。
  const storageBlocked =
    storageStatus != null && storageStatus.storageMode === 'self_hosted' && !storageStatus.tursoConfigured

  return (
    <main className="list-page">
      <div className="list-header">
        <div className="list-header-row">
          <h1>プロジェクト: {projectName}</h1>
          <div className="list-header-actions">
            <button
              type="button"
              className={`panel-toggle ${showNewReport ? 'active' : ''}`}
              onClick={() => setShowNewReport((v) => !v)}
            >
              + 新規報告
            </button>
            <button
              type="button"
              className={`panel-toggle ${showMembers ? 'active' : ''}`}
              onClick={() => setShowMembers((v) => !v)}
            >
              メンバー
            </button>
            <button
              type="button"
              className={`panel-toggle ${showStorage ? 'active' : ''} ${
                storageBlocked ? 'warning' : ''
              }`}
              onClick={() => setShowStorage((v) => !v)}
            >
              ストレージ設定
            </button>
            <button
              type="button"
              className={`panel-toggle ${showFieldOptions ? 'active' : ''}`}
              onClick={() => setShowFieldOptions((v) => !v)}
            >
              選択肢の管理
            </button>
            <button type="button" className="help-link" onClick={onOpenHelp}>
              SDK連携の使い方
            </button>
            <SegmentedToggle
              value={view}
              onChange={setView}
              options={[
                { value: 'table', label: 'テーブル' },
                { value: 'kanban', label: 'ボード' },
              ]}
            />
          </div>
        </div>
      </div>

      {showStorage && (
        <StorageSettingsPanel
          projectId={projectId}
          onFetchStatus={onFetchStorageStatus}
          onUpdateStorage={onUpdateStorage}
        />
      )}

      {showFieldOptions && (
        <FieldOptionsPanel
          hiddenFieldOptions={hiddenFieldOptions}
          onUpdateFieldOptions={onUpdateFieldOptions}
          customFieldOptions={customFieldOptions}
          onAddCustomOption={onAddCustomOption}
          onRemoveCustomOption={onRemoveCustomOption}
        />
      )}

      {storageBlocked ? (
        <div className="storage-blocking-panel">
          <p>
            このプロジェクトはまだデータベース（Turso）が設定されていないため、報告の閲覧・作成ができません。
            「ストレージ設定」から接続情報を入力してください。
          </p>
          <button className="help-link" onClick={() => setShowStorage(true)}>
            ストレージ設定を開く
          </button>
        </div>
      ) : (
        <>
          {showNewReport && (
            <NewReportForm
              projectId={projectId}
              defaultWho={defaultReporterName}
              buildOptions={reportFacets.builds}
              hiddenFieldOptions={hiddenFieldOptions}
              customFieldOptions={customFieldOptions}
              onFetchMembers={onFetchMembers}
              onCreate={onCreateReport}
              onClose={() => setShowNewReport(false)}
            />
          )}

          {showMembers && (
            <MembersPanel
              projectId={projectId}
              onFetchMembers={onFetchMembers}
              onAddMembers={onAddMembers}
              onRemoveMember={onRemoveMember}
            />
          )}

          <FilterBar
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
            assigneeFilter={assigneeFilter}
            setAssigneeFilter={setAssigneeFilter}
            reportFacets={reportFacets}
            hiddenFieldOptions={hiddenFieldOptions}
            customFieldOptions={customFieldOptions}
            resultCount={filtered.length}
          />

          {bugsLoading && <div className="list-inline-status">更新中...</div>}
          {!bugsLoading && bugsError && (
            <div className="list-inline-status list-inline-status-error">
              最新の一覧を取得できませんでした: {bugsError}
            </div>
          )}

          {view === 'table' ? (
            <div className="bug-table">
              <div className="bug-table-head">
                <div className="col-title">タイトル</div>
                <div className="col-tag">タグ</div>
                <div className="col-status">対応状況</div>
                <div className="col-who">報告者</div>
                <div className="col-build">ビルド</div>
                <div className="col-priority">優先度</div>
              </div>
              <div className="bug-table-body">
                {filtered.length === 0 && (
                  <div className="empty-hint table-empty">条件に一致する報告はありません</div>
                )}
                {filtered.map((b) => (
                  <div className="bug-row" key={b.id} onClick={() => onOpen(b.id)}>
                    <div className="col-title">{b.title}</div>
                    <div className="col-tag">
                      {b.tags.map((t, i) => (
                        <span className={`tag ${t}`} key={t}>
                          {b.tagLabels[i]}
                        </span>
                      ))}
                    </div>
                    <div className="col-status">
                      <span className={`status-badge ${b.status}`}>{statusLabel(b.status)}</span>
                    </div>
                    <div className="col-who">{b.who}</div>
                    <div className="col-build mono">{b.build}</div>
                    <div className="col-priority">{priorityLabel(b.priority)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : visibleStatusColumns.length === 0 ? (
            <div className="empty-hint table-empty">対応状況の絞り込みがすべて解除されています</div>
          ) : (
            <div
              className="kanban"
              style={{ gridTemplateColumns: `repeat(${visibleStatusColumns.length}, minmax(0, 1fr))` }}
            >
              {visibleStatusColumns.map((col) => {
                const items = filtered.filter((b) => b.status === col.key)
                return (
                  <div className="kanban-col" key={col.key}>
                    <div className="kanban-col-head">
                      <span>{col.label}</span>
                      <span className="count">{items.length}</span>
                    </div>
                    <div className="kanban-col-body">
                      {items.length === 0 && <div className="empty-hint">報告なし</div>}
                      {items.map((b) => (
                        <div className="bug-card" key={b.id} onClick={() => onOpen(b.id)}>
                          <div className="title">{b.title}</div>
                          <div className="meta">
                            {b.tags.map((t, i) => (
                              <span className={`tag ${t}`} key={t}>
                                {b.tagLabels[i]}
                              </span>
                            ))}
                            <span className="who">{b.who}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </main>
  )
}
