import React, { useEffect, useState } from 'react'
import { TAG_OPTIONS, PRIORITY_OPTIONS, PLATFORM_OPTIONS } from '../data/mockBugs.js'
import ComboField from './ComboField.jsx'
import TagMultiField from './TagMultiField.jsx'

const initialFields = (defaultWho) => ({
  title: '',
  tags: [],
  desc: '',
  who: defaultWho || '',
  build: '',
  platform: '',
  priority: 'medium',
})

export default function NewReportForm({
  projectId,
  defaultWho,
  buildOptions,
  hiddenFieldOptions,
  customFieldOptions,
  onFetchMembers,
  onCreate,
  onClose,
}) {
  const [fields, setFields] = useState(() => initialFields(defaultWho))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [whoOptions, setWhoOptions] = useState([])

  const tagOptions = [
    ...TAG_OPTIONS.map((t) => ({ value: t.key, label: t.label })),
    ...(customFieldOptions?.tag ?? []).map((v) => ({ value: v, label: v })),
  ]
  const platformOptions = [...PLATFORM_OPTIONS, ...(customFieldOptions?.platform ?? [])]

  useEffect(() => {
    let cancelled = false
    onFetchMembers(projectId)
      .then((members) => {
        if (cancelled) return
        const names = [...new Set(members.map((m) => m.displayName).filter(Boolean))].sort()
        setWhoOptions(names)
      })
      .catch(() => {
        if (!cancelled) setWhoOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [projectId, onFetchMembers])

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const requiredFilled =
    fields.title.trim() &&
    fields.tags.length > 0 &&
    fields.desc.trim() &&
    fields.who.trim() &&
    fields.build.trim() &&
    fields.platform.trim()

  function handleSubmit(e) {
    e.preventDefault()
    if (!requiredFilled) return
    setSubmitting(true)
    setError(null)
    onCreate(projectId, fields)
      .then(() => onClose())
      .catch((err) => setError(err.message ?? String(err)))
      .finally(() => setSubmitting(false))
  }

  return (
    <form className="new-report-form" onSubmit={handleSubmit}>
      <div className="new-report-hint">
        動画・入力ログなしでテキストのみの報告を作成します（Unity連携がまだの場合や、録画を撮り損ねた場合向け）。
      </div>

      <div className="new-report-grid">
        <label className="new-report-field new-report-field-wide">
          <span>タイトル</span>
          <input
            type="text"
            value={fields.title}
            onChange={(e) => setField('title', e.target.value)}
            autoFocus
          />
        </label>

        <div className="new-report-field new-report-field-wide">
          <span>タグ（複数選択可）</span>
          <TagMultiField
            value={fields.tags}
            onChange={(v) => setField('tags', v)}
            options={tagOptions}
            hiddenValues={hiddenFieldOptions?.tag}
            manualPlaceholder="例: サウンド不具合"
          />
        </div>

        <label className="new-report-field">
          <span>優先度</span>
          <select value={fields.priority} onChange={(e) => setField('priority', e.target.value)}>
            {PRIORITY_OPTIONS.filter(
              (p) => p.key === fields.priority || !hiddenFieldOptions?.priority?.includes(p.key)
            ).map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="new-report-field new-report-field-wide">
          <span>詳細</span>
          <textarea
            value={fields.desc}
            onChange={(e) => setField('desc', e.target.value)}
            rows={3}
          />
        </label>

        <label className="new-report-field">
          <span>報告者</span>
          <ComboField
            value={fields.who}
            onChange={(v) => setField('who', v)}
            options={whoOptions}
            placeholder="メンバーから選択"
            manualPlaceholder="報告者名を入力"
          />
        </label>

        <label className="new-report-field">
          <span>ビルド</span>
          <ComboField
            value={fields.build}
            onChange={(v) => setField('build', v)}
            options={buildOptions ?? []}
            placeholder="既存のビルドから選択"
            manualPlaceholder="例: 0.14.2-dev"
          />
        </label>

        <label className="new-report-field">
          <span>プラットフォーム</span>
          <ComboField
            value={fields.platform}
            onChange={(v) => setField('platform', v)}
            options={platformOptions}
            hiddenValues={hiddenFieldOptions?.platform}
            placeholder="選択してください"
            manualPlaceholder="例: PC (Steam)"
          />
        </label>
      </div>

      {error && <div className="project-form-error">{error}</div>}

      <div className="new-report-actions">
        <button type="submit" disabled={submitting || !requiredFilled}>
          {submitting ? '作成中...' : '作成'}
        </button>
        <button type="button" onClick={onClose} disabled={submitting}>
          キャンセル
        </button>
      </div>
    </form>
  )
}
