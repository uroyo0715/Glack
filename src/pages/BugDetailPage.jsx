import React, { useState, useEffect, useRef } from 'react'
import VideoPlayer from '../components/VideoPlayer.jsx'
import InputLogStrip from '../components/InputLogStrip.jsx'
import EditReportForm from '../components/EditReportForm.jsx'
import SegmentedToggle from '../components/SegmentedToggle.jsx'
import CommentThread from '../components/CommentThread.jsx'
import { STATUS_COLUMNS, PRIORITY_OPTIONS } from '../data/mockBugs.js'

function priorityLabel(key) {
  return PRIORITY_OPTIONS.find((p) => p.key === key)?.label ?? key
}

const WIDTH_STORAGE_KEY = 'glank-detail-width'
const MIN_DETAIL_WIDTH = 480
const DEFAULT_DETAIL_WIDTH = 1080
const PAGE_HORIZONTAL_MARGIN = 92 // .detail-pageのpadding等、コンテンツ幅として使えない余白の目安

function loadStoredWidth() {
  if (typeof window === 'undefined') return DEFAULT_DETAIL_WIDTH
  const n = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY))
  return Number.isFinite(n) && n >= MIN_DETAIL_WIDTH ? n : DEFAULT_DETAIL_WIDTH
}

const LOG_LAYOUT_STORAGE_KEY = 'glank-detail-log-layout'

function loadStoredLogLayout() {
  if (typeof window === 'undefined') return 'below'
  const v = window.localStorage.getItem(LOG_LAYOUT_STORAGE_KEY)
  return v === 'side' ? 'side' : 'below'
}

export default function BugDetailPage({
  bug,
  onStatusChange,
  onUpdateReport,
  onAttachVideo,
  buildOptions,
  hiddenFieldOptions,
  customFieldOptions,
  onFetchMembers,
  onDeleteReport,
  onFetchComments,
  onCreateComment,
  onDeleteComment,
  currentUserEmail,
}) {
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [attachingVideo, setAttachingVideo] = useState(false)
  const [attachVideoError, setAttachVideoError] = useState(null)
  const [detailWidth, setDetailWidth] = useState(loadStoredWidth)
  const [resizingWidth, setResizingWidth] = useState(false)
  const [logLayout, setLogLayout] = useState(loadStoredLogLayout) // 'side' | 'below'
  const [assigneeOptions, setAssigneeOptions] = useState([])
  const resizeDragRef = useRef(null) // { startX, startWidth }
  const hasVideo = Boolean(bug.videoUrl)
  const duration = hasVideo ? bug.durationFrames / bug.fps : 0

  // reset playback state when switching to a different bug
  useEffect(() => {
    setElapsed(0)
    setPlaying(false)
    setEditing(false)
    setConfirmingDelete(false)
    setDeleteError(null)
    setAttachVideoError(null)
  }, [bug.id])

  // 対応者のプルダウンはプロジェクトメンバーの表示名から選ぶ（報告者選択と同じ考え方）。
  useEffect(() => {
    let cancelled = false
    onFetchMembers(bug.projectId)
      .then((members) => {
        if (cancelled) return
        const names = [...new Set(members.map((m) => m.displayName).filter(Boolean))].sort()
        setAssigneeOptions(names)
      })
      .catch(() => {
        if (!cancelled) setAssigneeOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [bug.projectId, onFetchMembers])

  function handleAssigneeChange(e) {
    onUpdateReport(bug.id, { assignee: e.target.value })
  }

  function handleAttachVideoChange(e) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    setAttachingVideo(true)
    setAttachVideoError(null)
    onAttachVideo(bug.id, file)
      .catch((err) => setAttachVideoError(err.message ?? String(err)))
      .finally(() => setAttachingVideo(false))
  }

  function handleSelectFrame(frame) {
    setPlaying(false)
    setElapsed(Math.max(0, Math.min(duration, frame / bug.fps)))
  }

  function setLogLayoutPersisted(next) {
    setLogLayout(next)
    window.localStorage.setItem(LOG_LAYOUT_STORAGE_KEY, next)
  }

  function handleConfirmDelete() {
    setDeleting(true)
    setDeleteError(null)
    onDeleteReport(bug.id)
      .catch((err) => {
        setDeleteError(err.message ?? String(err))
        setDeleting(false)
      })
  }

  // 詳細ページの幅をドラッグで調整できるようにする。選んだ幅はブラウザに保存し、次回以降も引き継ぐ。
  function handleResizePointerDown(e) {
    resizeDragRef.current = { startX: e.clientX, startWidth: detailWidth }
    e.currentTarget.setPointerCapture(e.pointerId)
    setResizingWidth(true)
  }

  function handleResizePointerMove(e) {
    if (!resizeDragRef.current) return
    const { startX, startWidth } = resizeDragRef.current
    const maxWidth = window.innerWidth - PAGE_HORIZONTAL_MARGIN
    const next = Math.min(maxWidth, Math.max(MIN_DETAIL_WIDTH, startWidth + (e.clientX - startX)))
    setDetailWidth(next)
  }

  function handleResizePointerUp(e) {
    if (!resizeDragRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    resizeDragRef.current = null
    setResizingWidth(false)
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(detailWidth))
  }

  return (
    <main className="detail-page">
      <div
        className={`detail-content ${resizingWidth ? 'resizing' : ''}`}
        style={{ width: `${detailWidth}px`, maxWidth: '100%' }}
      >
        <div className="header">
          <div className="header-top">
            <div className="detail-tag-list">
              {bug.tags.map((t, i) => (
                <span className={`tag detail-tag ${t}`} key={t}>
                  {bug.tagLabels[i]}
                </span>
              ))}
            </div>
            <div className="header-actions">
              <button type="button" className="edit-toggle" onClick={() => setEditing((v) => !v)}>
                {editing ? '編集をやめる' : '編集'}
              </button>
              <button
                type="button"
                className="edit-toggle delete-toggle"
                onClick={() => setConfirmingDelete(true)}
              >
                削除
              </button>
            </div>
          </div>
          <h1>{bug.title}</h1>
          <div className="desc">{bug.desc}</div>

          <div className="status-row">
            <div className="status-row-item">
              <div className="k">ステータス</div>
              <select
                className="status-select"
                value={bug.status}
                onChange={(e) => onStatusChange(bug.id, e.target.value)}
              >
                {STATUS_COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="status-row-item">
              <div className="k">対応者</div>
              <select className="status-select" value={bug.assignee} onChange={handleAssigneeChange}>
                <option value="">未割り当て</option>
                {/* 現在の対応者がメンバー一覧から外れていても（脱退済み等）選択肢自体は消さない */}
                {[...new Set([bug.assignee, ...assigneeOptions].filter(Boolean))].map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="meta-row">
            <div className="meta-item">
              <div className="k">報告者</div>
              <div className="v">{bug.who}</div>
            </div>
            <div className="meta-item">
              <div className="k">ビルド</div>
              <div className="v mono">{bug.build}</div>
            </div>
            <div className="meta-item">
              <div className="k">プラットフォーム</div>
              <div className="v">{bug.platform}</div>
            </div>
            <div className="meta-item">
              <div className="k">優先度</div>
              <div className="v">{priorityLabel(bug.priority)}</div>
            </div>
          </div>
        </div>

        {confirmingDelete && (
          <div className="delete-confirm">
            <p>
              この報告「{bug.title}」を削除します。録画・入力ログも含めて完全に削除され、
              <strong>この操作は取り消せません。</strong>
            </p>
            {deleteError && <div className="project-form-error">{deleteError}</div>}
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="delete-confirm-danger"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? '削除中...' : '削除する'}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                キャンセル
              </button>
            </div>
          </div>
        )}

        {editing && (
          <EditReportForm
            bug={bug}
            buildOptions={buildOptions}
            hiddenFieldOptions={hiddenFieldOptions}
            customFieldOptions={customFieldOptions}
            onFetchMembers={onFetchMembers}
            onUpdate={onUpdateReport}
            onClose={() => setEditing(false)}
          />
        )}

        {hasVideo ? (
          <>
            <div className="detail-layout-toggle-row">
              <SegmentedToggle
                value={logLayout}
                onChange={setLogLayoutPersisted}
                options={[
                  { value: 'side', label: '操作ログを右に' },
                  { value: 'below', label: '操作ログを下に' },
                ]}
              />
            </div>
            <div className={`detail-columns ${logLayout === 'below' ? 'stacked' : ''}`}>
              <div className="detail-col-video">
                <VideoPlayer
                  videoUrl={bug.videoUrl}
                  duration={duration}
                  elapsed={elapsed}
                  setElapsed={setElapsed}
                  playing={playing}
                  setPlaying={setPlaying}
                />
              </div>
              <div className="detail-col-log">
                <InputLogStrip bug={bug} elapsed={elapsed} onSelectFrame={handleSelectFrame} />
              </div>
            </div>
          </>
        ) : (
          <div className="no-video-hint">
            <p>録画・入力ログはありません（Web UIから手動作成された報告です）。</p>
            <label className="no-video-attach-button">
              {attachingVideo ? 'アップロード中...' : '動画を追加'}
              <input
                type="file"
                accept="video/*"
                onChange={handleAttachVideoChange}
                disabled={attachingVideo}
                hidden
              />
            </label>
            {attachVideoError && <div className="project-form-error">{attachVideoError}</div>}
          </div>
        )}

        <CommentThread
          bugId={bug.id}
          currentUserEmail={currentUserEmail}
          onFetchComments={onFetchComments}
          onCreateComment={onCreateComment}
          onDeleteComment={onDeleteComment}
        />

        <div
          className="detail-resize-handle"
          title="ドラッグして幅を調整"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
        >
          <div className="detail-resize-grip">
            <span className="detail-resize-grip-icon">⋮⋮</span>
            <span className="detail-resize-grip-label">幅</span>
          </div>
        </div>
      </div>
    </main>
  )
}
