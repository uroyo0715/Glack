import React, { useEffect, useRef, useState } from 'react'

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function VideoPlayer({ duration, elapsed, setElapsed, playing, setPlaying }) {
  const scrubRef = useRef(null)
  const timerRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const resumeAfterDragRef = useRef(false)
  const stateRef = useRef({ elapsed, duration })

  useEffect(() => {
    stateRef.current = { elapsed, duration }
  }, [elapsed, duration])

  // スペースキーで再生/一時停止（テキスト入力中やボタンにフォーカスがある場合は奪わない）
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.code !== 'Space' || e.repeat) return
      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || el?.isContentEditable) {
        return
      }
      e.preventDefault()
      const { elapsed: cur, duration: dur } = stateRef.current
      if (cur >= dur) setElapsed(0)
      setPlaying((v) => !v)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setElapsed, setPlaying])

  useEffect(() => {
    if (playing && !dragging) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 0.05
          if (next >= duration) {
            clearInterval(timerRef.current)
            setPlaying(false)
            return duration
          }
          return next
        })
      }, 50)
    }
    return () => clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration, dragging])

  function togglePlay() {
    if (elapsed >= duration) setElapsed(0)
    setPlaying((v) => !v)
  }

  function elapsedFromPointer(clientX) {
    const rect = scrubRef.current.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return pct * duration
  }

  function handlePointerDown(e) {
    scrubRef.current.setPointerCapture(e.pointerId)
    resumeAfterDragRef.current = playing
    setPlaying(false)
    setDragging(true)
    setElapsed(elapsedFromPointer(e.clientX))
  }

  function handlePointerMove(e) {
    if (!dragging) return
    setElapsed(elapsedFromPointer(e.clientX))
  }

  function handlePointerUp(e) {
    if (!dragging) return
    scrubRef.current.releasePointerCapture(e.pointerId)
    setDragging(false)
    if (resumeAfterDragRef.current) setPlaying(true)
  }

  const pct = Math.min(100, (elapsed / duration) * 100)

  return (
    <>
      <div className="video-wrap">
        <div className="video-fake">
          <span className="glitch mono">[ recorded clip · {duration.toFixed(1)}s ]</span>
        </div>
        <div className="play-btn" onClick={togglePlay}>
          {playing ? (
            <svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </div>
      </div>

      <div className="controls">
        <div
          className={`scrub ${dragging ? 'dragging' : ''}`}
          ref={scrubRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="fill" style={{ width: `${pct}%` }} />
          <div className="handle" style={{ left: `${pct}%` }} />
        </div>
        <div className="time mono">
          {fmt(elapsed)} / {fmt(duration)}
        </div>
      </div>
    </>
  )
}
