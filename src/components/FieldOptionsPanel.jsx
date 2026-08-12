import React, { useState } from 'react'
import { TAG_OPTIONS, PRIORITY_OPTIONS, PLATFORM_OPTIONS } from '../data/mockBugs.js'

const FIELDS = [
  { key: 'tag', label: '種類', options: TAG_OPTIONS.map((t) => ({ value: t.key, label: t.label })) },
  { key: 'priority', label: '優先度', options: PRIORITY_OPTIONS.map((p) => ({ value: p.key, label: p.label })) },
  { key: 'platform', label: 'プラットフォーム', options: PLATFORM_OPTIONS.map((p) => ({ value: p, label: p })) },
]

/** 種類・優先度・プラットフォームのプルダウンから、このプロジェクトでは使わない項目を隠す設定。 */
export default function FieldOptionsPanel({ hiddenFieldOptions, onUpdateFieldOptions }) {
  const [pendingKey, setPendingKey] = useState(null) // "tag:crash" のように処理中の項目を覚えておく
  const [error, setError] = useState(null)

  function isHidden(fieldKey, value) {
    return hiddenFieldOptions?.[fieldKey]?.includes(value) ?? false
  }

  function toggle(fieldKey, value) {
    const current = hiddenFieldOptions?.[fieldKey] ?? []
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    setPendingKey(`${fieldKey}:${value}`)
    setError(null)
    onUpdateFieldOptions({ [fieldKey]: next })
      .catch((err) => setError(err.message ?? String(err)))
      .finally(() => setPendingKey(null))
  }

  return (
    <div className="field-options-panel">
      <div className="members-panel-label">選択肢の管理</div>
      <p className="storage-panel-hint">
        このプロジェクトで使わない項目をオフにすると、報告フォームのプルダウンから消えます
        （既存の報告データは変わりません）。
      </p>
      {error && <div className="project-form-error">{error}</div>}
      {FIELDS.map((field) => (
        <div className="field-options-group" key={field.key}>
          <div className="field-options-group-label">{field.label}</div>
          <div className="field-options-chips">
            {field.options.map((opt) => {
              const hidden = isHidden(field.key, opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`field-option-chip ${hidden ? 'hidden' : ''}`}
                  disabled={pendingKey === `${field.key}:${opt.value}`}
                  onClick={() => toggle(field.key, opt.value)}
                  title={hidden ? 'クリックして表示する' : 'クリックして非表示にする'}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
