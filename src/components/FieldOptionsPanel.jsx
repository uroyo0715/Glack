import React, { useState } from 'react'
import { TAG_OPTIONS, PRIORITY_OPTIONS, PLATFORM_OPTIONS } from '../data/mockBugs.js'

const FIELDS = [
  {
    key: 'tag',
    label: '種類',
    options: TAG_OPTIONS.map((t) => ({ value: t.key, label: t.label })),
    canAddCustom: true,
  },
  {
    key: 'priority',
    label: '優先度',
    options: PRIORITY_OPTIONS.map((p) => ({ value: p.key, label: p.label })),
    canAddCustom: false,
  },
  {
    key: 'platform',
    label: 'プラットフォーム',
    options: PLATFORM_OPTIONS.map((p) => ({ value: p, label: p })),
    canAddCustom: true,
  },
]

/** 種類・優先度・プラットフォームのプルダウンの既定項目を隠したり、独自の項目を追加/削除する設定。 */
export default function FieldOptionsPanel({
  hiddenFieldOptions,
  onUpdateFieldOptions,
  customFieldOptions,
  onAddCustomOption,
  onRemoveCustomOption,
}) {
  const [pendingKey, setPendingKey] = useState(null) // "tag:crash" のように処理中の項目を覚えておく
  const [error, setError] = useState(null)
  const [newValueByField, setNewValueByField] = useState({})

  function isHidden(fieldKey, value) {
    return hiddenFieldOptions?.[fieldKey]?.includes(value) ?? false
  }

  function toggleHidden(fieldKey, value) {
    const current = hiddenFieldOptions?.[fieldKey] ?? []
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    setPendingKey(`${fieldKey}:${value}`)
    setError(null)
    onUpdateFieldOptions({ [fieldKey]: next })
      .catch((err) => setError(err.message ?? String(err)))
      .finally(() => setPendingKey(null))
  }

  function removeCustom(fieldKey, value) {
    setPendingKey(`${fieldKey}:${value}`)
    setError(null)
    onRemoveCustomOption(fieldKey, value)
      .catch((err) => setError(err.message ?? String(err)))
      .finally(() => setPendingKey(null))
  }

  function addCustom(fieldKey) {
    const value = (newValueByField[fieldKey] ?? '').trim()
    if (!value) return
    setPendingKey(`${fieldKey}:__new__`)
    setError(null)
    onAddCustomOption(fieldKey, value)
      .then(() => setNewValueByField((prev) => ({ ...prev, [fieldKey]: '' })))
      .catch((err) => setError(err.message ?? String(err)))
      .finally(() => setPendingKey(null))
  }

  return (
    <div className="field-options-panel">
      <div className="members-panel-label">選択肢の管理</div>
      <p className="storage-panel-hint">
        既定の項目は使わないものをオフにすると報告フォームのプルダウンから消えます。
        種類・プラットフォームはこのプロジェクト独自の項目を追加でき、追加したものはいつでも削除できます
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
                  onClick={() => toggleHidden(field.key, opt.value)}
                  title={hidden ? 'クリックして表示する' : 'クリックして非表示にする'}
                >
                  {opt.label}
                </button>
              )
            })}
            {field.canAddCustom &&
              (customFieldOptions?.[field.key] ?? []).map((value) => (
                <span key={value} className="field-option-chip field-option-chip-custom">
                  {value}
                  <button
                    type="button"
                    disabled={pendingKey === `${field.key}:${value}`}
                    onClick={() => removeCustom(field.key, value)}
                    aria-label={`${value}を削除`}
                    title="この独自項目を削除する"
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
          {field.canAddCustom && (
            <form
              className="field-options-add"
              onSubmit={(e) => {
                e.preventDefault()
                addCustom(field.key)
              }}
            >
              <input
                type="text"
                value={newValueByField[field.key] ?? ''}
                onChange={(e) =>
                  setNewValueByField((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={`独自の${field.label}を追加`}
              />
              <button type="submit" disabled={!(newValueByField[field.key] ?? '').trim()}>
                追加
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  )
}
