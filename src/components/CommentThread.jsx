import React, { useEffect, useMemo, useState } from 'react'

const MAX_INDENT_DEPTH = 6
const INDENT_PX = 20

function formatCreatedAt(iso) {
  const d = new Date(iso.includes('T') || iso.endsWith('Z') ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })
}

/** フラットな配列(parentCommentIdで返信関係を持つ)から、親id -> 子コメント配列 のMapを作る。 */
function buildChildrenMap(comments) {
  const map = new Map()
  for (const c of comments) {
    const key = c.parentCommentId ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(c)
  }
  return map
}

function CommentNode({
  comment,
  depth,
  childrenMap,
  currentUserEmail,
  replyingToId,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  replySubmitting,
  replyError,
  confirmingDeleteId,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  deletingId,
  deleteError,
}) {
  const [replyBody, setReplyBody] = useState('')
  const children = childrenMap.get(comment.id) ?? []
  const indent = Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PX
  const isReplying = replyingToId === comment.id
  const isConfirmingDelete = confirmingDeleteId === comment.id
  const isDeleting = deletingId === comment.id

  function handleReplySubmit(e) {
    e.preventDefault()
    if (!replyBody.trim()) return
    onSubmitReply(comment.id, replyBody.trim()).then((ok) => {
      if (ok) setReplyBody('')
    })
  }

  return (
    <div className="comment-item" style={{ marginLeft: `${indent}px` }}>
      <div className="comment-item-head">
        <span className="comment-item-author">{comment.authorDisplayName}</span>
        <span className="comment-item-time">{formatCreatedAt(comment.createdAt)}</span>
      </div>
      <div className="comment-item-body">{comment.body}</div>
      <div className="comment-item-actions">
        <button type="button" className="comment-item-action" onClick={() => onStartReply(comment.id)}>
          返信
        </button>
        {comment.authorEmail === currentUserEmail &&
          (isConfirmingDelete ? (
            <>
              <button
                type="button"
                className="comment-item-action comment-item-action-danger"
                onClick={() => onConfirmDelete(comment.id)}
                disabled={isDeleting}
              >
                {isDeleting ? '削除中...' : '削除する'}
              </button>
              <button type="button" className="comment-item-action" onClick={onCancelDelete} disabled={isDeleting}>
                取消
              </button>
            </>
          ) : (
            <button type="button" className="comment-item-action" onClick={() => onStartDelete(comment.id)}>
              削除
            </button>
          ))}
      </div>
      {isConfirmingDelete && deleteError && <div className="project-form-error">{deleteError}</div>}

      {isReplying && (
        <form className="comment-form comment-reply-form" onSubmit={handleReplySubmit}>
          <textarea
            className="comment-form-input"
            placeholder="返信を入力..."
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            disabled={replySubmitting}
            rows={2}
            autoFocus
          />
          {replyError && <div className="project-form-error">{replyError}</div>}
          <div className="comment-form-actions">
            <button type="button" onClick={onCancelReply} disabled={replySubmitting} className="comment-form-cancel">
              取消
            </button>
            <button type="submit" disabled={replySubmitting || !replyBody.trim()}>
              {replySubmitting ? '返信中...' : '返信する'}
            </button>
          </div>
        </form>
      )}

      {children.map((child) => (
        <CommentNode
          key={child.id}
          comment={child}
          depth={depth + 1}
          childrenMap={childrenMap}
          currentUserEmail={currentUserEmail}
          replyingToId={replyingToId}
          onStartReply={onStartReply}
          onCancelReply={onCancelReply}
          onSubmitReply={onSubmitReply}
          replySubmitting={replySubmitting}
          replyError={replyError}
          confirmingDeleteId={confirmingDeleteId}
          onStartDelete={onStartDelete}
          onCancelDelete={onCancelDelete}
          onConfirmDelete={onConfirmDelete}
          deletingId={deletingId}
          deleteError={deleteError}
        />
      ))}
    </div>
  )
}

export default function CommentThread({ bugId, currentUserEmail, onFetchComments, onCreateComment, onDeleteComment }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [newBody, setNewBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const [replyingToId, setReplyingToId] = useState(null)
  const [replySubmitting, setReplySubmitting] = useState(false)
  const [replyError, setReplyError] = useState(null)

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

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

  const childrenMap = useMemo(() => buildChildrenMap(comments), [comments])
  const topLevel = childrenMap.get(null) ?? []

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

  function handleStartReply(commentId) {
    setReplyingToId(commentId)
    setReplyError(null)
  }

  function handleCancelReply() {
    setReplyingToId(null)
    setReplyError(null)
  }

  // 成功したらtrueを返す（呼び出し元のCommentNodeがそれを見て入力欄をクリアする）
  function handleSubmitReply(parentCommentId, body) {
    setReplySubmitting(true)
    setReplyError(null)
    return onCreateComment(bugId, body, parentCommentId)
      .then((comment) => {
        setComments((prev) => [...prev, comment])
        setReplyingToId(null)
        return true
      })
      .catch((err) => {
        setReplyError(err.message ?? String(err))
        return false
      })
      .finally(() => setReplySubmitting(false))
  }

  function handleStartDelete(commentId) {
    setConfirmingDeleteId(commentId)
    setDeleteError(null)
  }

  function handleCancelDelete() {
    setConfirmingDeleteId(null)
    setDeleteError(null)
  }

  function handleConfirmDelete(commentId) {
    setDeletingId(commentId)
    setDeleteError(null)
    onDeleteComment(bugId, commentId)
      .then(() => {
        // 削除対象と、それへの返信も(サーバー側で連動削除されるため)まとめてローカルからも外す
        setComments((prev) => {
          const removed = new Set([commentId])
          let changed = true
          while (changed) {
            changed = false
            for (const c of prev) {
              if (c.parentCommentId != null && removed.has(c.parentCommentId) && !removed.has(c.id)) {
                removed.add(c.id)
                changed = true
              }
            }
          }
          return prev.filter((c) => !removed.has(c.id))
        })
        setConfirmingDeleteId(null)
      })
      .catch((err) => setDeleteError(err.message ?? String(err)))
      .finally(() => setDeletingId(null))
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
          {topLevel.length === 0 ? (
            <div className="comment-thread-state">まだコメントはありません。</div>
          ) : (
            topLevel.map((c) => (
              <CommentNode
                key={c.id}
                comment={c}
                depth={0}
                childrenMap={childrenMap}
                currentUserEmail={currentUserEmail}
                replyingToId={replyingToId}
                onStartReply={handleStartReply}
                onCancelReply={handleCancelReply}
                onSubmitReply={handleSubmitReply}
                replySubmitting={replySubmitting}
                replyError={replyError}
                confirmingDeleteId={confirmingDeleteId}
                onStartDelete={handleStartDelete}
                onCancelDelete={handleCancelDelete}
                onConfirmDelete={handleConfirmDelete}
                deletingId={deletingId}
                deleteError={deleteError}
              />
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
