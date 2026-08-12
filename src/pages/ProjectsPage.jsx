import React, { useState } from 'react'

export default function ProjectsPage({ projects, onOpen, onCreate, onDelete, onOpenHelp }) {
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

  return (
    <main className="projects-page">
      <div className="list-header">
        <div className="eyebrow">Glank</div>
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
        {projects.map((p) => (
          <button
            className={`project-card ${selecting ? 'selectable' : ''} ${
              selectedIds.has(p.id) ? 'selected' : ''
            }`}
            key={p.id}
            onClick={() => handleCardClick(p)}
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
          </button>
        ))}

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
