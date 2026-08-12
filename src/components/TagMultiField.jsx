import React, { useState } from 'react'

/**
 * 種類（タグ）は1件の報告に複数付けられる。プリセットはトグルボタンで選び、
 * プリセットにない種類はテキスト入力から追加できる。選択済みは上部にチップで表示し、
 * ×で個別に外せる。
 */
export default function TagMultiField({ value, onChange, options, hiddenValues, manualPlaceholder }) {
  const [manualInput, setManualInput] = useState('')

  const visibleOptions = options.filter(
    (opt) => value.includes(opt.value) || !hiddenValues?.includes(opt.value)
  )

  function toggle(optValue) {
    onChange(
      value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue]
    )
  }

  function remove(v) {
    onChange(value.filter((x) => x !== v))
  }

  function labelFor(v) {
    return options.find((o) => o.value === v)?.label ?? v
  }

  function handleAddManual(e) {
    e.preventDefault()
    const v = manualInput.trim()
    if (!v || value.includes(v)) return
    onChange([...value, v])
    setManualInput('')
  }

  return (
    <div className="tag-multi-field">
      {value.length > 0 && (
        <div className="tag-multi-selected">
          {value.map((v) => (
            <span className="tag-multi-chip" key={v}>
              {labelFor(v)}
              <button type="button" onClick={() => remove(v)} aria-label={`${labelFor(v)}を外す`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="tag-multi-options">
        {visibleOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`tag-multi-option ${value.includes(opt.value) ? 'active' : ''}`}
            onClick={() => toggle(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <form className="tag-multi-add" onSubmit={handleAddManual}>
        <input
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder={manualPlaceholder}
        />
        <button type="submit" disabled={!manualInput.trim()}>
          追加
        </button>
      </form>
    </div>
  )
}
