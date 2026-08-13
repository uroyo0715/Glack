import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VideoPlayer from './VideoPlayer.jsx'

function renderPlayer(props = {}) {
  const defaultProps = {
    videoUrl: 'https://example.com/clip.mp4',
    duration: 10,
    elapsed: 0,
    setElapsed: vi.fn(),
    playing: false,
    setPlaying: vi.fn(),
  }
  render(<VideoPlayer {...defaultProps} {...props} />)
  return document.querySelector('video')
}

describe('VideoPlayer', () => {
  let playSpy
  let pauseSpy

  beforeEach(() => {
    // jsdomは実際のメディア再生を持たないため、play/pauseが呼ばれたかどうかだけを確認する。
    playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue()
    pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  afterEach(() => {
    playSpy.mockRestore()
    pauseSpy.mockRestore()
  })

  it('renders a real <video> element pointing at bug.videoUrl (not a fake placeholder)', () => {
    const video = renderPlayer()
    expect(video).toBeInTheDocument()
    expect(video.src).toBe('https://example.com/clip.mp4')
    expect(document.querySelector('.video-fake')).not.toBeInTheDocument()
  })

  it('calls play()/pause() on the underlying video element when the playing prop toggles', () => {
    const { rerender } = render(
      <VideoPlayer
        videoUrl="https://example.com/clip.mp4"
        duration={10}
        elapsed={0}
        setElapsed={vi.fn()}
        playing={false}
        setPlaying={vi.fn()}
      />
    )
    rerender(
      <VideoPlayer
        videoUrl="https://example.com/clip.mp4"
        duration={10}
        elapsed={0}
        setElapsed={vi.fn()}
        playing={true}
        setPlaying={vi.fn()}
      />
    )
    expect(playSpy).toHaveBeenCalled()

    rerender(
      <VideoPlayer
        videoUrl="https://example.com/clip.mp4"
        duration={10}
        elapsed={0}
        setElapsed={vi.fn()}
        playing={false}
        setPlaying={vi.fn()}
      />
    )
    expect(pauseSpy).toHaveBeenCalled()
  })

  it('seeks the video element to match the elapsed prop (e.g. clicking a frame in the input log)', () => {
    const video = renderPlayer({ elapsed: 4.2 })
    expect(video.currentTime).toBeCloseTo(4.2)
  })

  it('updates elapsed via setElapsed when the video fires a timeupdate event', () => {
    const setElapsed = vi.fn()
    const video = renderPlayer({ setElapsed })
    Object.defineProperty(video, 'currentTime', { value: 3.5, writable: true })
    fireEvent.timeUpdate(video)
    expect(setElapsed).toHaveBeenCalledWith(3.5)
  })

  it('calls setPlaying(false) when the video fires an ended event', () => {
    const setPlaying = vi.fn()
    const video = renderPlayer({ elapsed: 9.9, playing: true, setPlaying })
    fireEvent.ended(video)
    expect(setPlaying).toHaveBeenCalledWith(false)
  })

  it('clicking the play button toggles the playing state via setPlaying', () => {
    const setPlaying = vi.fn()
    renderPlayer({ setPlaying })
    fireEvent.click(document.querySelector('.play-btn'))
    expect(setPlaying).toHaveBeenCalled()
  })

  it('pressing Space toggles play/pause', () => {
    const setPlaying = vi.fn()
    renderPlayer({ setPlaying })
    fireEvent.keyDown(window, { code: 'Space' })
    expect(setPlaying).toHaveBeenCalled()
  })
})
