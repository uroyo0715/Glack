import React, { useState } from 'react'
import { STATUS_COLUMNS, FREQUENCY_OPTIONS } from '../data/mockBugs.js'
import FilterBar from '../components/FilterBar.jsx'
import MembersPanel from '../components/MembersPanel.jsx'
import NewReportForm from '../components/NewReportForm.jsx'

function statusLabel(key) {
  return STATUS_COLUMNS.find((s) => s.key === key)?.label ?? key
}

function frequencyLabel(key) {
  return FREQUENCY_OPTIONS.find((f) => f.key === key)?.label ?? key
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
  onCreateReport,
  defaultReporterName,
  query,
  setQuery,
  statusFilter,
  toggleStatus,
  tagFilter,
  toggleTag,
  buildFilter,
  setBuildFilter,
  whoFilter,
  setWhoFilter,
  reportFacets,
}) {
  const [view, setView] = useState('table') // 'table' | 'kanban'
  const [showMembers, setShowMembers] = useState(false)
  const [showNewReport, setShowNewReport] = useState(false)

  // 絞り込みは App.jsx が fetchReports() 呼び出し時にサーバー側（クエリパラメータ）で行う。
  // ここでは取得済みの bugs をそのまま表示する。
  const filtered = bugs
  // ステータスの絞り込みで外されたタブはカンバンでも列ごと非表示にする（カードだけでなく）。
  const visibleStatusColumns = STATUS_COLUMNS.filter((col) => statusFilter.includes(col.key))

  return (
    <main className="list-page">
      <div className="list-header">
        <div className="eyebrow">Bug Reports</div>
        <div className="list-header-row">
          <h1>プロジェクト: {projectName}</h1>
          <div className="list-header-actions">
            <button className="help-link" onClick={() => setShowNewReport((v) => !v)}>
              {showNewReport ? '新規報告を閉じる' : '+ 新規報告'}
            </button>
            <button className="help-link" onClick={() => setShowMembers((v) => !v)}>
              {showMembers ? 'メンバーを閉じる' : 'メンバー'}
            </button>
            <div className="view-toggle">
              <button
                className={view === 'table' ? 'active' : ''}
                onClick={() => setView('table')}
              >
                テーブル
              </button>
              <button
                className={view === 'kanban' ? 'active' : ''}
                onClick={() => setView('kanban')}
              >
                カンバン
              </button>
            </div>
          </div>
        </div>
      </div>

      {showNewReport && (
        <NewReportForm
          projectId={projectId}
          defaultWho={defaultReporterName}
          buildOptions={reportFacets.builds}
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
        buildFilter={buildFilter}
        setBuildFilter={setBuildFilter}
        whoFilter={whoFilter}
        setWhoFilter={setWhoFilter}
        reportFacets={reportFacets}
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
            <div className="col-tag">種類</div>
            <div className="col-status">対応状況</div>
            <div className="col-who">報告者</div>
            <div className="col-build">ビルド</div>
            <div className="col-freq">頻度</div>
          </div>
          <div className="bug-table-body">
            {filtered.length === 0 && (
              <div className="empty-hint table-empty">条件に一致する報告はありません</div>
            )}
            {filtered.map((b) => (
              <div className="bug-row" key={b.id} onClick={() => onOpen(b.id)}>
                <div className="col-title">{b.title}</div>
                <div className="col-tag">
                  <span className={`tag ${b.tag}`}>{b.tagLabel}</span>
                </div>
                <div className="col-status">
                  <span className={`status-badge ${b.status}`}>{statusLabel(b.status)}</span>
                </div>
                <div className="col-who">{b.who}</div>
                <div className="col-build mono">{b.build}</div>
                <div className="col-freq">{frequencyLabel(b.frequency)}</div>
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
                        <span className={`tag ${b.tag}`}>{b.tagLabel}</span>
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
    </main>
  )
}
