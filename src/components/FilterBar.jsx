import React from 'react'
import { STATUS_COLUMNS, TAG_OPTIONS, PRIORITY_OPTIONS, UNASSIGNED_FILTER_VALUE } from '../data/mockBugs.js'

const TAG_LABELS = Object.fromEntries(TAG_OPTIONS.map((t) => [t.key, t.label]))

// 絞り込みチップに出す「タグ」の一覧を組み立てる。
// プリセット + このプロジェクトが追加した独自項目 + 実際の報告で使われている自由記述のタグを
// まとめたうえで、「選択肢の管理」で非表示にしたプリセットだけ除く。
function buildTagChipOptions(hiddenFieldOptions, customFieldOptions, reportFacets) {
  const hidden = hiddenFieldOptions?.tag ?? []
  const keys = new Set([
    ...TAG_OPTIONS.map((t) => t.key),
    ...(customFieldOptions?.tag ?? []),
    ...(reportFacets?.tags ?? []),
  ])
  return [...keys]
    .filter((key) => !hidden.includes(key))
    .map((key) => ({ key, label: TAG_LABELS[key] ?? key }))
}

export default function FilterBar({
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
  hiddenFieldOptions,
  customFieldOptions,
  resultCount,
}) {
  const tagChipOptions = buildTagChipOptions(hiddenFieldOptions, customFieldOptions, reportFacets)
  const priorityChipOptions = PRIORITY_OPTIONS.filter(
    (p) => !(hiddenFieldOptions?.priority ?? []).includes(p.key)
  )

  return (
    <div className="filter-bar">
      <div className="filter-bar-row">
        <input
          className="search-input"
          type="text"
          placeholder="タイトル・内容で検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="facet-field">
          <label htmlFor="filter-build" className="facet-field-label">
            ビルド:
          </label>
          <select
            id="filter-build"
            className="facet-select"
            value={buildFilter}
            onChange={(e) => setBuildFilter(e.target.value)}
          >
            <option value="">すべて</option>
            {reportFacets.builds.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className="facet-field">
          <label htmlFor="filter-who" className="facet-field-label">
            報告者:
          </label>
          <select
            id="filter-who"
            className="facet-select"
            value={whoFilter}
            onChange={(e) => setWhoFilter(e.target.value)}
          >
            <option value="">すべて</option>
            {reportFacets.whos.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>

        <div className="facet-field">
          <label htmlFor="filter-assignee" className="facet-field-label">
            対応者:
          </label>
          <select
            id="filter-assignee"
            className="facet-select"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="">すべて</option>
            <option value={UNASSIGNED_FILTER_VALUE}>未割り当て</option>
            {(reportFacets.assignees ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="chip-group">
          <span className="chip-group-label">状況</span>
          {STATUS_COLUMNS.map((s) => (
            <button
              key={s.key}
              className={`chip status-chip ${s.key} ${statusFilter.includes(s.key) ? 'active' : ''}`}
              onClick={() => toggleStatus(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="chip-group">
          <span className="chip-group-label">優先度</span>
          {priorityChipOptions.map((p) => (
            <button
              key={p.key}
              className={`chip ${priorityFilter.includes(p.key) ? 'active' : ''}`}
              onClick={() => togglePriority(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="result-count mono">{resultCount}件</div>
      </div>

      <div className="filter-bar-row">
        <div className="chip-group">
          <span className="chip-group-label">タグ</span>
          {tagChipOptions.map((t) => (
            <button
              key={t.key}
              className={`chip ${tagFilter.includes(t.key) ? 'active' : ''}`}
              onClick={() => toggleTag(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
