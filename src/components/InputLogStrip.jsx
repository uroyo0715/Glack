import React, { useEffect, useMemo, useRef, useState } from 'react'

const TOLERANCE_FRAMES = 6 // 60fps基準で約0.1秒
const COLLIDE_PX = 34 // これより近い入力は段を分けて重なりを避ける（同時押しは何段になってもよい）
const ROW_HEIGHT_PX = 40
const ROW_TOP_OFFSET_PX = 20
const RULER_HEIGHT_PX = 22
const OFFSCREEN_MARGIN_PX = 40
const MIN_PX_PER_FRAME = 1
const MAX_PX_PER_FRAME = 30
const DEFAULT_PX_PER_FRAME = 6
const ZOOM_STEP = 1.15

function formatTime(frame, fps) {
  const totalSeconds = frame / fps
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

function toExportJson(bug) {
  return JSON.stringify(
    {
      fps: bug.fps,
      durationFrames: bug.durationFrames,
      inputs: bug.inputs.map((inp) => ({
        frame: inp.frame,
        key: inp.key,
        label: inp.label,
        holdFrames: inp.holdFrames || 0,
      })),
    },
    null,
    2
  )
}

export default function InputLogStrip({ bug, elapsed, onSelectFrame }) {
  const [open, setOpen] = useState(true)
  const [view, setView] = useState('timeline') // 'timeline' | 'text'
  const [copyState, setCopyState] = useState('idle') // 'idle' | 'copied' | 'error'
  const [pxPerFrame, setPxPerFrame] = useState(DEFAULT_PX_PER_FRAME)
  const [railWidth, setRailWidth] = useState(640)
  const [draggingRail, setDraggingRail] = useState(false)
  const railRef = useRef(null)
  // タイムライン/テキスト表示の切り替えで.frame-railはDOMごと作り直されるため、
  // 常にマウントされ続ける.log-stripの方を監視する（幅は同じ＝padding分を除いたcontent幅）。
  const logStripRef = useRef(null)
  const railDragRef = useRef(null) // { anchorFrame, anchorCenterX }

  // 現在位置（プレイヘッド）を常にレール中央に固定し、キーが右（未来）→左（過去）へ流れる方式。
  // 操作数が多いゲームでも、常に「今この瞬間の前後」だけを見ればよくなる。
  useEffect(() => {
    const el = logStripRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setRailWidth(w)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // マウスホイールでキー間隔（ズーム）を拡大/縮小する。
  // .frame-railはタイムライン/テキスト表示の切り替えでDOMごと作り直されるため、
  // viewを依存配列に入れて、表示し直すたびにリスナーを付け直す。
  useEffect(() => {
    const el = railRef.current
    if (!el) return
    function handleWheel(e) {
      e.preventDefault()
      setPxPerFrame((prev) => {
        const next = e.deltaY > 0 ? prev / ZOOM_STEP : prev * ZOOM_STEP
        return Math.min(MAX_PX_PER_FRAME, Math.max(MIN_PX_PER_FRAME, next))
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [view])

  const elapsedFrame = elapsed * bug.fps
  // 同時押し（同フレーム、または許容範囲内に複数キー）をすべて拾う
  const activeInputs = bug.inputs.filter(
    (inp) => Math.abs(inp.frame - elapsedFrame) < TOLERANCE_FRAMES
  )

  const centerX = railWidth / 2
  function frameToX(frame) {
    return centerX + (frame - elapsedFrame) * pxPerFrame
  }

  // 近接する入力（同時押しを含む）は段を分けて重なりを避ける
  // （貪欲な区間彩色）ので、同時押しの数が3つ以上でも正しく分離できる。
  const { placedGlyphs, rowCount } = useMemo(() => {
    const sorted = [...bug.inputs]
      .map((inp, i) => ({ ...inp, i, x: frameToX(inp.frame) }))
      .sort((a, b) => a.x - b.x)
    const rowLastX = []
    for (const item of sorted) {
      let row = rowLastX.findIndex((lastX) => item.x - lastX >= COLLIDE_PX)
      if (row === -1) {
        row = rowLastX.length
        rowLastX.push(item.x)
      } else {
        rowLastX[row] = item.x
      }
      item.row = row
    }
    return { placedGlyphs: sorted.sort((a, b) => a.i - b.i), rowCount: Math.max(1, rowLastX.length) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bug.inputs, pxPerFrame, elapsedFrame, railWidth])

  const railHeight = RULER_HEIGHT_PX + ROW_TOP_OFFSET_PX * 2 + ROW_HEIGHT_PX * rowCount

  const rulerTicks = useMemo(() => {
    const totalSeconds = Math.ceil(bug.durationFrames / bug.fps) + 1
    const ticks = []
    for (let sec = 0; sec <= totalSeconds; sec++) ticks.push(sec)
    return ticks
  }, [bug.durationFrames, bug.fps])

  function selectFrame(frame) {
    onSelectFrame?.(Math.max(0, Math.min(bug.durationFrames, frame)))
  }

  // レールをドラッグして再生バーのようにスクラブする。水色の線（現在位置）を起点とし、
  // クリック位置へは飛ばず、そこからのポインタ移動量だけでフレームを進退させる
  // （どこを掴んでも、常に「今の位置」から相対的に動く）。
  function handleRailPointerDown(e) {
    if (e.target.closest('.input-glyph')) return
    railDragRef.current = { anchorFrame: elapsedFrame, anchorClientX: e.clientX }
    railRef.current.setPointerCapture(e.pointerId)
    setDraggingRail(true)
  }

  function handleRailPointerMove(e) {
    if (!railDragRef.current) return
    const { anchorFrame, anchorClientX } = railDragRef.current
    const deltaFrames = (anchorClientX - e.clientX) / pxPerFrame // 左へドラッグ = 時間を進める
    selectFrame(anchorFrame + deltaFrames)
  }

  function handleRailPointerUp(e) {
    if (!railDragRef.current) return
    railRef.current.releasePointerCapture(e.pointerId)
    railDragRef.current = null
    setDraggingRail(false)
  }

  function handleCopy() {
    navigator.clipboard
      .writeText(toExportJson(bug))
      .then(() => {
        setCopyState('copied')
        setTimeout(() => setCopyState('idle'), 1500)
      })
      .catch(() => {
        setCopyState('error')
        setTimeout(() => setCopyState('idle'), 1500)
      })
  }

  function handleDownload() {
    const blob = new Blob([toExportJson(bug)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `glank-input-log-${bug.id ?? 'report'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <button
        className={`log-toggle ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chev">▶</span> 操作ログを表示
      </button>

      <div className={`log-strip-wrap ${open ? 'open' : ''}`}>
        <div className="log-strip" ref={logStripRef}>
          <div className="log-strip-head">
            <div className="strip-label">Input Log</div>
            <div className="log-view-toggle">
              <button
                className={view === 'timeline' ? 'active' : ''}
                onClick={() => setView('timeline')}
              >
                タイムライン
              </button>
              <button className={view === 'text' ? 'active' : ''} onClick={() => setView('text')}>
                テキスト
              </button>
            </div>
          </div>

          {view === 'timeline' ? (
            <>
              <div
                className={`frame-rail ${draggingRail ? 'dragging' : ''}`}
                ref={railRef}
                style={{ height: `${railHeight}px` }}
                onPointerDown={handleRailPointerDown}
                onPointerMove={handleRailPointerMove}
                onPointerUp={handleRailPointerUp}
              >
                <div className="rail-playhead" style={{ left: `${centerX}px` }} />
                {rulerTicks.map((sec) => {
                  const x = frameToX(sec * bug.fps)
                  if (x < -OFFSCREEN_MARGIN_PX || x > railWidth + OFFSCREEN_MARGIN_PX) return null
                  return (
                    <div key={sec} className="rail-tick" style={{ left: `${x}px` }}>
                      <span className="rail-tick-label">{formatTime(sec * bug.fps, bug.fps)}</span>
                    </div>
                  )
                })}
                {placedGlyphs.map((inp) => {
                  if (inp.x < -OFFSCREEN_MARGIN_PX || inp.x > railWidth + OFFSCREEN_MARGIN_PX) return null
                  const isHit = Math.abs(inp.frame - elapsedFrame) < TOLERANCE_FRAMES
                  return (
                    <button
                      key={inp.i}
                      type="button"
                      className={`input-glyph ${isHit ? 'hit' : ''}`}
                      style={{
                        left: `${inp.x}px`,
                        top: `${RULER_HEIGHT_PX + ROW_TOP_OFFSET_PX + ROW_HEIGHT_PX * inp.row}px`,
                      }}
                      title={`#${inp.frame}f (${formatTime(inp.frame, bug.fps)}) ${inp.key} — ${inp.label}（保持: ${
                        inp.holdFrames || 0
                      }f）クリックでこの位置へ移動`}
                      onClick={() => selectFrame(inp.frame)}
                    >
                      {inp.key}
                      {inp.holdFrames > 0 && <span className="input-glyph-hold">{inp.holdFrames}f</span>}
                    </button>
                  )
                })}
              </div>
              <div className="rail-hint">
                <span>
                  ドラッグで再生位置を移動 ／ ホイールでキー間隔を拡大縮小（
                  {(pxPerFrame / DEFAULT_PX_PER_FRAME).toFixed(1)}×）
                </span>
              </div>
              <div className="frame-caption">
                {activeInputs.length > 0 ? (
                  activeInputs.map((inp, idx) => (
                    <span key={idx} className="frame-caption-entry">
                      {idx > 0 && <span className="frame-caption-sep">＋</span>}
                      <b>{inp.key}</b> — {inp.label}
                      <span className="frame-caption-hold">（保持: {inp.holdFrames || 0}f）</span>
                    </span>
                  ))
                ) : (
                  '再生すると、その時点の入力がここに表示されます。キーをクリックするとその地点に移動します。'
                )}
              </div>
            </>
          ) : (
            <>
              <div className="log-text-list">
                <div className="log-text-head">
                  <span className="col-frame">フレーム</span>
                  <span className="col-time">時刻</span>
                  <span className="col-key">キー</span>
                  <span className="col-hold">保持</span>
                  <span className="col-label">内容</span>
                </div>
                <div className="log-text-body">
                  {bug.inputs.length === 0 ? (
                    <div className="log-text-empty">入力ログはありません</div>
                  ) : (
                    bug.inputs.map((inp, i) => {
                      const isHit = Math.abs(inp.frame - elapsedFrame) < TOLERANCE_FRAMES
                      const holdFrames = inp.holdFrames || 0
                      return (
                        <div
                          key={i}
                          className={`log-text-row ${isHit ? 'hit' : ''}`}
                          onClick={() => selectFrame(inp.frame)}
                          title="クリックでこの位置へ移動"
                        >
                          <span className="col-frame mono">{inp.frame}</span>
                          <span className="col-time mono">{formatTime(inp.frame, bug.fps)}</span>
                          <span className="col-key mono">{inp.key}</span>
                          <span className={`col-hold mono ${holdFrames > 0 ? 'has-hold' : ''}`}>
                            {holdFrames > 0 ? `${holdFrames}f` : '—'}
                          </span>
                          <span className="col-label">{inp.label}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
              <div className="log-text-actions">
                <button type="button" onClick={handleCopy}>
                  {copyState === 'copied' ? 'コピーしました' : copyState === 'error' ? 'コピーに失敗' : 'JSONをコピー'}
                </button>
                <button type="button" onClick={handleDownload}>
                  JSONをダウンロード
                </button>
                <span className="log-text-hint">Unity再現用（Glank Replayerで読み込み可能）</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
