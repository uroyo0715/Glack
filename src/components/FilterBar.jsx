import React from 'react'
import { STATUS_COLUMNS, TAG_OPTIONS, PRIORITY_OPTIONS } from '../data/mockBugs.js'

const TAG_LABELS = Object.fromEntries(TAG_OPTIONS.map((t) => [t.key, t.label]))

// 絞り込みチップに出す「種類」の一覧を組み立てる。
// プリセット + このプロジェクトが追加した独自項目 + 実際の報告で使われている自由記述の種類を
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
      <input
        className="search-input"
        type="text"
        placeholder="タイトル・内容で検索..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <select
        className="facet-select"
        value={buildFilter}
        onChange={(e) => setBuildFilter(e.target.value)}
      >
        <option value="">ビルド: すべて</option>
        {reportFacets.builds.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      <select className="facet-select" value={whoFilter} onChange={(e) => setWhoFilter(e.target.value)}>
        <option value="">報告者: すべて</option>
        {reportFacets.whos.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>

      <div className="chip-group">
        <span className="chip-group-label">対応</span>
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
        <span className="chip-group-label">種類</span>
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
  )
}
