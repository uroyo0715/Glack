import React, { useState } from 'react'

const MANUAL_OPTION = '__manual__'

// optionsは文字列の配列（value===label）でも、{value, label}の配列でもよい
// （例: 種類のようにキーと表示ラベルが異なるプリセットを扱う場合に使う）。
function normalizeOptions(options) {
  return options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt))
}

/** プルダウン選択と自由入力のどちらでも値を決められる入力欄。 */
export default function ComboField({ value, onChange, options, placeholder, manualPlaceholder, inputType = 'text' }) {
  const [manualMode, setManualMode] = useState(false)
  const normalized = normalizeOptions(options)

  if (manualMode) {
    return (
      <div className="combo-field">
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={manualPlaceholder}
        />
        <button type="button" className="combo-field-toggle" onClick={() => setManualMode(false)}>
          プルダウンから選ぶ
        </button>
      </div>
    )
  }

  return (
    <div className="combo-field">
      <select
        value={normalized.some((opt) => opt.value === value) ? value : ''}
        onChange={(e) => {
          if (e.target.value === MANUAL_OPTION) {
            setManualMode(true)
          } else {
            onChange(e.target.value)
          }
        }}
      >
        <option value="">{placeholder ?? '選択してください'}</option>
        {normalized.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value={MANUAL_OPTION}>直接入力する</option>
      </select>
    </div>
  )
}
