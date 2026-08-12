import React from 'react'

// 複数箇所（一覧のテーブル/ボード切替、ログのタイムライン/テキスト切替、
// 詳細ページのログ配置切替）で同じ見た目のトグルが個別に実装されていたのをまとめたもの。
export default function SegmentedToggle({ options, value, onChange, className = '' }) {
  return (
    <div className={`segmented-toggle ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
