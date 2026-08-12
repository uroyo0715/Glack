import React, { useState } from 'react'

export default function ProjectsPage({
  projects,
  onOpen,
  onCreate,
  onDelete,
  onOpenHelp,
  onUpdateProject,
  onRemoveImage,
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  // カードの「編集」（名前・サムネイル画像をまとめて変更する）。一度に1件だけ編集できる。
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editImageFile, setEditImageFile] = useState(null)
  const [editImagePreview, setEditImagePreview] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState(null)

  function handleImageChange(e) {
    const file = e.target.files?.[0] ?? null
    setImageFile(file)
    setImagePreview(file ? URL.createObjectURL(file) : null)
  }

  function resetForm() {
    setName('')
    setImageFile(null)
    setImagePreview(null)
    setError(null)
    setCreating(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    onCreate(name.trim(), imageFile)
      .then(() => resetForm())
      .catch((err) => setError(err.message ?? String(err)))
      .finally(() => setSubmitting(false))
  }

  function toggleSelecting() {
    setSelecting((prev) => !prev)
    setSelectedIds(new Set())
    setConfirming(false)
    setDeleteError(null)
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCardClick(p) {
    if (selecting) toggleSelected(p.id)
    else onOpen(p.id)
  }

  function handleCardKeyDown(e, p) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    handleCardClick(p)
  }

  const selectedProjects = projects.filter((p) => selectedIds.has(p.id))
  const affectedBugCount = selectedProjects.reduce((sum, p) => sum + (p.bugCount ?? 0), 0)

  function handleConfirmDelete() {
    setDeleting(true)
    setDeleteError(null)
    onDelete(Array.from(selectedIds))
      .then(() => {
        setSelecting(false)
        setSelectedIds(new Set())
        setConfirming(false)
      })
      .catch((err) => setDeleteError(err.message ?? String(err)))
      .finally(() => setDeleting(false))
  }

  function startEditing(e, p) {
    e.stopPropagation()
    setEditingId(p.id)
    setEditName(p.name)
    setEditImageFile(null)
    setEditImagePreview(p.imageUrl)
    setEditError(null)
  }

  function cancelEditing(e) {
    e?.stopPropagation()
    setEditingId(null)
  }

  function handleEditImageChange(e) {
    const file = e.target.files?.[0] ?? null
    if (!file) return
    setEditImageFile(file)
    setEditImagePreview(URL.createObjectURL(file))
  }

  function handleEditImageRemove(e) {
    e.stopPropagation()
    if (!editingId) return
    setEditSubmitting(true)
    setEditError(null)
    onRemoveImage(editingId)
      .then(() => {
        setEditImageFile(null)
        setEditImagePreview(null)
      })
      .catch((err) => setEditError(err.message ?? String(err)))
      .finally(() => setEditSubmitting(false))
  }

  function handleEditSubmit(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!editName.trim()) return
    setEditSubmitting(true)
    setEditError(null)
    onUpdateProject(editingId, { name: editName.trim(), imageFile: editImageFile })
      .then(() => setEditingId(null))
      .catch((err) => setEditError(err.message ?? String(err)))
      .finally(() => setEditSubmitting(false))
  }

  return (
    <main className="projects-page">
      <div className="list-header">
        <div className="list-header-row">
          <h1>プロジェクト</h1>
          <div className="projects-header-actions">
            {selecting && selectedIds.size > 0 && (
              <button className="project-delete-trigger" onClick={() => setConfirming(true)}>
                {selectedIds.size}件を削除
              </button>
            )}
            <button className="help-link" onClick={toggleSelecting}>
              {selecting ? '選択を解除' : '選択'}
            </button>
            <button className="help-link" onClick={onOpenHelp}>
              Unity連携の使い方 →
            </button>
          </div>
        </div>
      </div>

      {confirming && (
        <div className="delete-confirm">
          <p>
            選択した{selectedIds.size}件のプロジェクトを削除します。
            {affectedBugCount > 0 && (
              <>
                同時に<strong>{affectedBugCount}件のバグ報告</strong>もすべて削除されます。
              </>
            )}
            この操作は取り消せません。
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
            <button type="button" onClick={() => setConfirming(false)} disabled={deleting}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div className="project-grid">
        {projects.map((p) =>
          editingId === p.id ? (
            <form
              className="project-card project-card-edit-form"
              key={p.id}
              onSubmit={handleEditSubmit}
              onClick={(e) => e.stopPropagation()}
            >
              <label className="project-image-picker">
                {editImagePreview ? (
                  <img src={editImagePreview} alt="" className="project-image-preview" />
                ) : (
                  <span className="project-card-placeholder">画像を選択</span>
                )}
                <input type="file" accept="image/*" onChange={handleEditImageChange} hidden />
              </label>
              {editImagePreview && (
                <button
                  type="button"
                  className="project-image-remove-link"
                  onClick={handleEditImageRemove}
                  disabled={editSubmitting}
                >
                  画像を削除
                </button>
              )}
              <input
                className="project-name-input"
                type="text"
                placeholder="プロジェクト名"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
              {editError && <div className="project-form-error">{editError}</div>}
              <div className="project-form-actions">
                <button type="submit" disabled={editSubmitting || !editName.trim()}>
                  {editSubmitting ? '保存中...' : '保存'}
                </button>
                <button type="button" onClick={cancelEditing} disabled={editSubmitting}>
                  取消
                </button>
              </div>
            </form>
          ) : (
            <div
              className={`project-card ${selecting ? 'selectable' : ''} ${
                selectedIds.has(p.id) ? 'selected' : ''
              }`}
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => handleCardClick(p)}
              onKeyDown={(e) => handleCardKeyDown(e, p)}
            >
              {selecting && (
                <div className={`project-card-checkbox ${selectedIds.has(p.id) ? 'checked' : ''}`} />
              )}
              <div
                className="project-card-image"
                style={p.imageUrl ? { backgroundImage: `url(${p.imageUrl})` } : undefined}
              >
                {!p.imageUrl && <span className="project-card-placeholder">No Image</span>}
              </div>
              <div className="project-card-name">{p.name}</div>
              <div className="project-card-id mono">ID: {p.id}</div>
              {!selecting && (
                <button
                  type="button"
                  className="project-card-edit-button"
                  onClick={(e) => startEditing(e, p)}
                  aria-label="プロジェクトを編集"
                  title="編集"
                >
                  ✎
                </button>
              )}
            </div>
          )
        )}

        {!selecting &&
          (creating ? (
            <form className="project-card project-card-new-form" onSubmit={handleSubmit}>
              <label className="project-image-picker">
                {imagePreview ? (
                  <img src={imagePreview} alt="" className="project-image-preview" />
                ) : (
                  <span className="project-card-placeholder">画像を選択</span>
                )}
                <input type="file" accept="image/*" onChange={handleImageChange} hidden />
              </label>
              <input
                className="project-name-input"
                type="text"
                placeholder="プロジェクト名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {error && <div className="project-form-error">{error}</div>}
              <div className="project-form-actions">
                <button type="submit" disabled={submitting || !name.trim()}>
                  {submitting ? '作成中...' : '作成'}
                </button>
                <button type="button" onClick={resetForm}>
                  取消
                </button>
              </div>
            </form>
          ) : (
            <button className="project-card project-card-add" onClick={() => setCreating(true)}>
              <div className="project-card-add-icon">+</div>
              <div className="project-card-name">新規プロジェクト</div>
            </button>
          ))}
      </div>
    </main>
  )
}
