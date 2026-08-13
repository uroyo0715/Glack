import React, { useEffect, useState } from 'react'

function formatCreatedAt(iso) {
  const d = new Date(iso.includes('T') || iso.endsWith('Z') ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })
}

export default function CommentThread({ bugId, onFetchComments, onCreateComment }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [newBody, setNewBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    onFetchComments(bugId)
      .then((result) => {
        if (!cancelled) setComments(result)
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
  }, [bugId, onFetchComments])

  function handleSubmit(e) {
    e.preventDefault()
    if (!newBody.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    onCreateComment(bugId, newBody.trim())
      .then((comment) => {
        setComments((prev) => [...prev, comment])
        setNewBody('')
      })
      .catch((err) => setSubmitError(err.message ?? String(err)))
      .finally(() => setSubmitting(false))
  }

  return (
    <div className="comment-thread">
      <div className="comment-thread-head">コメント{comments.length > 0 ? `（${comments.length}）` : ''}</div>

      {loading ? (
        <div className="comment-thread-state">読み込み中...</div>
      ) : loadError ? (
        <div className="comment-thread-state comment-thread-error">
          コメントの取得に失敗しました: {loadError}
        </div>
      ) : (
        <div className="comment-list">
          {comments.length === 0 ? (
            <div className="comment-thread-state">まだコメントはありません。</div>
          ) : (
            comments.map((c) => (
              <div className="comment-item" key={c.id}>
                <div className="comment-item-head">
                  <span className="comment-item-author">{c.authorDisplayName}</span>
                  <span className="comment-item-time">{formatCreatedAt(c.createdAt)}</span>
                </div>
                <div className="comment-item-body">{c.body}</div>
              </div>
            ))
          )}
        </div>
      )}

      <form className="comment-form" onSubmit={handleSubmit}>
        <textarea
          className="comment-form-input"
          placeholder="コメントを入力..."
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          disabled={submitting}
          rows={3}
        />
        {submitError && <div className="project-form-error">{submitError}</div>}
        <div className="comment-form-actions">
          <button type="submit" disabled={submitting || !newBody.trim()}>
            {submitting ? '投稿中...' : '投稿'}
          </button>
        </div>
      </form>
    </div>
  )
}
