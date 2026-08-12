import React, { useState } from 'react'

export default function LoginPage({ onGoogleLogin }) {
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function handleClick() {
    setSubmitting(true)
    setError(null)
    onGoogleLogin().catch((err) => {
      setError(err.message ?? String(err))
      setSubmitting(false)
    })
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand">
          <div className="brand-dot" />
          <span>Glank</span>
        </div>
        <h1>ログイン</h1>
        <p className="login-hint">Googleアカウントでログインしてください。</p>

        {error && <div className="login-error">{error}</div>}

        <button type="button" className="login-google-button" onClick={handleClick} disabled={submitting}>
          {submitting ? '接続中...' : 'Googleでログイン'}
        </button>
      </div>
    </main>
  )
}
