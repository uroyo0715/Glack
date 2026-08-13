import React, { useEffect, useState } from 'react'

const EMPTY_TURSO = { url: '', authToken: '' }
const EMPTY_R2 = { accountId: '', accessKeyId: '', secretAccessKey: '', bucket: '', publicUrl: '' }

export default function StorageSettingsPanel({ projectId, onFetchStatus, onUpdateStorage }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [modeSaving, setModeSaving] = useState(false)
  const [modeError, setModeError] = useState(null)

  const [tursoFields, setTursoFields] = useState(EMPTY_TURSO)
  const [tursoSaving, setTursoSaving] = useState(false)
  const [tursoError, setTursoError] = useState(null)

  const [r2Fields, setR2Fields] = useState(EMPTY_R2)
  const [r2Saving, setR2Saving] = useState(false)
  const [r2Error, setR2Error] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    onFetchStatus(projectId)
      .then((result) => {
        if (!cancelled) setStatus(result)
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
  }, [projectId, onFetchStatus])

  function handleModeChange(nextMode) {
    setModeSaving(true)
    setModeError(null)
    onUpdateStorage(projectId, { storageMode: nextMode })
      .then((result) => setStatus(result))
      .catch((err) => setModeError(err.message ?? String(err)))
      .finally(() => setModeSaving(false))
  }

  function handleTursoSubmit(e) {
    e.preventDefault()
    setTursoSaving(true)
    setTursoError(null)
    onUpdateStorage(projectId, { turso: tursoFields })
      .then((result) => {
        setStatus(result)
        setTursoFields(EMPTY_TURSO)
      })
      .catch((err) => setTursoError(err.message ?? String(err)))
      .finally(() => setTursoSaving(false))
  }

  function handleR2Submit(e) {
    e.preventDefault()
    setR2Saving(true)
    setR2Error(null)
    onUpdateStorage(projectId, { r2: r2Fields })
      .then((result) => {
        setStatus(result)
        setR2Fields(EMPTY_R2)
      })
      .catch((err) => setR2Error(err.message ?? String(err)))
      .finally(() => setR2Saving(false))
  }

  if (loading) {
    return (
      <div className="storage-panel">
        <div className="members-panel-hint">読み込み中...</div>
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="storage-panel">
        <div className="project-form-error">{loadError}</div>
      </div>
    )
  }

  const isSelfHosted = status.storageMode === 'self_hosted'

  return (
    <div className="storage-panel">
      <div className="members-panel-label">ストレージ設定</div>
      <p className="storage-panel-hint">
        報告のデータベースと動画の保存先を選べます。チーム自前のTurso・R2を使えば無料です。
        Glankが用意する共有ストレージ（managed）を使うと、プロジェクトごとのTurso・R2設定が
        不要になります（プロジェクト単位500MB・全体8GBの上限あり）。
        {!status.isManagedAllowed && 'ただし現在このプロジェクトでは利用できません。'}
      </p>

      <div className="storage-mode-toggle">
        <label className={`storage-mode-option ${isSelfHosted ? 'active' : ''}`}>
          <input
            type="radio"
            name="storageMode"
            checked={isSelfHosted}
            disabled={modeSaving}
            onChange={() => handleModeChange('self_hosted')}
          />
          self_hosted（自前・無料）
        </label>
        <label
          className={`storage-mode-option ${!isSelfHosted ? 'active' : ''} ${
            !status.isManagedAllowed ? 'disabled' : ''
          }`}
          title={!status.isManagedAllowed ? 'このプロジェクトではまだ利用できません' : undefined}
        >
          <input
            type="radio"
            name="storageMode"
            checked={!isSelfHosted}
            disabled={modeSaving || !status.isManagedAllowed}
            onChange={() => handleModeChange('managed')}
          />
          managed（Glank共有）
        </label>
      </div>
      {modeError && <div className="project-form-error">{modeError}</div>}

      {isSelfHosted && !status.tursoConfigured && (
        <div className="storage-blocking-hint">
          データベース（Turso）が未設定のため、このプロジェクトの報告機能はまだ使えません。下のフォームから設定してください。
        </div>
      )}

      {isSelfHosted && (
        <div className="storage-config-forms">
          <form className="storage-config-form" onSubmit={handleTursoSubmit}>
            <div className="storage-config-form-head">
              <span>Turso（データベース）</span>
              <span className={`storage-status-badge ${status.tursoConfigured ? 'ok' : ''}`}>
                {status.tursoConfigured ? '設定済み' : '未設定'}
              </span>
            </div>
            <input
              type="text"
              placeholder="Database URL（例: libsql://xxx.turso.io）"
              value={tursoFields.url}
              onChange={(e) => setTursoFields((f) => ({ ...f, url: e.target.value }))}
            />
            <input
              type="password"
              placeholder="Auth Token"
              value={tursoFields.authToken}
              onChange={(e) => setTursoFields((f) => ({ ...f, authToken: e.target.value }))}
            />
            {tursoError && <div className="project-form-error">{tursoError}</div>}
            <button type="submit" disabled={tursoSaving || !tursoFields.url || !tursoFields.authToken}>
              {tursoSaving ? '保存中...' : 'Tursoの接続情報を保存'}
            </button>
          </form>

          <form className="storage-config-form" onSubmit={handleR2Submit}>
            <div className="storage-config-form-head">
              <span>R2（動画・画像ストレージ）</span>
              <span className={`storage-status-badge ${status.r2Configured ? 'ok' : ''}`}>
                {status.r2Configured ? '設定済み' : '未設定'}
              </span>
            </div>
            <input
              type="text"
              placeholder="Account ID"
              value={r2Fields.accountId}
              onChange={(e) => setR2Fields((f) => ({ ...f, accountId: e.target.value }))}
            />
            <input
              type="text"
              placeholder="Access Key ID"
              value={r2Fields.accessKeyId}
              onChange={(e) => setR2Fields((f) => ({ ...f, accessKeyId: e.target.value }))}
            />
            <input
              type="password"
              placeholder="Secret Access Key"
              value={r2Fields.secretAccessKey}
              onChange={(e) => setR2Fields((f) => ({ ...f, secretAccessKey: e.target.value }))}
            />
            <input
              type="text"
              placeholder="Bucket名"
              value={r2Fields.bucket}
              onChange={(e) => setR2Fields((f) => ({ ...f, bucket: e.target.value }))}
            />
            <input
              type="text"
              placeholder="公開URL（例: https://pub-xxx.r2.dev）"
              value={r2Fields.publicUrl}
              onChange={(e) => setR2Fields((f) => ({ ...f, publicUrl: e.target.value }))}
            />
            {r2Error && <div className="project-form-error">{r2Error}</div>}
            <button
              type="submit"
              disabled={
                r2Saving ||
                !r2Fields.accountId ||
                !r2Fields.accessKeyId ||
                !r2Fields.secretAccessKey ||
                !r2Fields.bucket ||
                !r2Fields.publicUrl
              }
            >
              {r2Saving ? '保存中...' : 'R2の接続情報を保存'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
