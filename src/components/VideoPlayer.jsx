import React, { useEffect, useRef, useState } from 'react'

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// currentTimeとelapsedの間で往復更新が起きないよう、この差以内なら再設定しない
// （timeupdateで来るelapsedの値をそのままvideo.currentTimeへ書き戻すと、ブラウザによっては
// 微妙なズレでシークが起きてカクつくことがあるため）。
const SEEK_EPSILON_SECONDS = 0.05

export default function VideoPlayer({ videoUrl, duration, elapsed, setElapsed, playing, setPlaying }) {
  const scrubRef = useRef(null)
  const videoRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const resumeAfterDragRef = useRef(false)
  const stateRef = useRef({ elapsed, duration })

  useEffect(() => {
    stateRef.current = { elapsed, duration }
  }, [elapsed, duration])

  // elapsed（外部からのシーク・入力ログクリックでの移動を含む）を実際の動画のcurrentTimeへ反映する。
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (Math.abs(video.currentTime - elapsed) > SEEK_EPSILON_SECONDS) {
      video.currentTime = elapsed
    }
  }, [elapsed])

  // playing状態を実際の再生/一時停止に反映する。
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      video.play().catch(() => {}) // 自動再生ポリシーで拒否されても無視（ユーザー操作起点なので通常は許可される）
    } else {
      video.pause()
    }
  }, [playing])

  // 動画自身の再生位置をelapsedへ反映し、操作ログのハイライトが追従するようにする。
  function handleTimeUpdate() {
    setElapsed(videoRef.current.currentTime)
  }

  function handleEnded() {
    setPlaying(false)
  }

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

  // ドラッグ中は実際の動画も一時停止させておく（スクラブ中に再生が進んでしまわないように）。
  useEffect(() => {
    const video = videoRef.current
    if (!video || !dragging) return
    video.pause()
  }, [dragging])

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
        <video
          ref={videoRef}
          className="video-element"
          src={videoUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          playsInline
        />
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
