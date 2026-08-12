import React from 'react'
import { STATUS_COLUMNS, TAG_OPTIONS } from '../data/mockBugs.js'

export default function FilterBar({
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
  resultCount,
}) {
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
            className={`chip ${statusFilter.includes(s.key) ? 'active' : ''}`}
            onClick={() => toggleStatus(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="chip-group">
        <span className="chip-group-label">種類</span>
        {TAG_OPTIONS.map((t) => (
          <button
            key={t.key}
            className={`chip tag-chip ${t.key} ${tagFilter.includes(t.key) ? 'active' : ''}`}
            onClick={() => toggleTag(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="result-count mono">{resultCount}件</div>
    </div>
  )
}
