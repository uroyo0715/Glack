import React, { useEffect, useState } from 'react'

function parseEmails(raw) {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function MembersPanel({ projectId, onFetchMembers, onAddMembers, onRemoveMember }) {
  const [members, setMembers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showEmail, setShowEmail] = useState(false) // 既定は表示名表示

  const [emailsInput, setEmailsInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const [removingEmail, setRemovingEmail] = useState(null)
  const [removeError, setRemoveError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    onFetchMembers(projectId)
      .then((result) => {
        if (!cancelled) setMembers(result)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message ?? String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, onFetchMembers])

  function handleSubmit(e) {
    e.preventDefault()
    const emails = parseEmails(emailsInput)
    if (emails.length === 0) return
    setSubmitting(true)
    setSubmitError(null)
    onAddMembers(projectId, emails)
      .then((result) => {
        setMembers(result.members)
        setEmailsInput('')
      })
      .catch((err) => setSubmitError(err.message ?? String(err)))
      .finally(() => setSubmitting(false))
  }

  function handleRemove(email) {
    setRemovingEmail(email)
    setRemoveError(null)
    onRemoveMember(projectId, email)
      .then((result) => setMembers(result.members))
      .catch((err) => setRemoveError(err.message ?? String(err)))
      .finally(() => setRemovingEmail(null))
  }

  return (
    <div className="members-panel">
      <div className="members-panel-list">
        <div className="members-panel-header">
          <div className="members-panel-label">メンバー</div>
          <button
            type="button"
            className="members-display-toggle"
            onClick={() => setShowEmail((v) => !v)}
          >
            {showEmail ? '表示名で表示' : 'メールで表示'}
          </button>
        </div>
        {loading ? (
          <div className="members-panel-hint">読み込み中...</div>
        ) : loadError ? (
          <div className="project-form-error">{loadError}</div>
        ) : members.length === 0 ? (
          <div className="members-panel-hint">まだメンバーがいません</div>
        ) : (
          <ul className="members-list">
            {members.map((m) => (
              <li key={m.email} className="members-list-item">
                <span className={showEmail ? 'mono' : ''}>
                  {showEmail ? m.email : m.displayName || m.email}
                </span>
                <button
                  type="button"
                  className="members-remove-button"
                  onClick={() => handleRemove(m.email)}
                  disabled={removingEmail === m.email}
                  title="メンバーを削除"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {removeError && <div className="project-form-error">{removeError}</div>}
      </div>

      <form className="members-invite-form" onSubmit={handleSubmit}>
        <div className="members-panel-label">メンバーを招待</div>
        <textarea
          className="members-invite-textarea"
          placeholder={'メールアドレスを改行またはカンマ区切りで入力\n例:\nalice@example.com\nbob@example.com'}
          value={emailsInput}
          onChange={(e) => setEmailsInput(e.target.value)}
          rows={4}
        />
        {submitError && <div className="project-form-error">{submitError}</div>}
        <button type="submit" disabled={submitting || parseEmails(emailsInput).length === 0}>
          {submitting ? '追加中...' : '追加'}
        </button>
      </form>
    </div>
  )
}
