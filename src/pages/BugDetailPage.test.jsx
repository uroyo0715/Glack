import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BugDetailPage from './BugDetailPage.jsx'

const noVideoBug = {
  id: 1,
  projectId: 1,
  title: 'テキストのみ報告',
  tags: ['crash'],
  tagLabels: ['クラッシュ'],
  status: 'todo',
  desc: '説明',
  who: 'tester',
  assignee: '',
  build: '0.0.1',
  platform: 'PC',
  priority: 'medium',
  videoUrl: '',
  fps: 0,
  durationFrames: 0,
  inputs: [],
}

function renderPage(overrides = {}) {
  const props = {
    bug: noVideoBug,
    onStatusChange: vi.fn(),
    onUpdateReport: vi.fn(),
    onAttachVideo: vi.fn().mockResolvedValue({ ...noVideoBug, videoUrl: 'blob:new', fps: 30, durationFrames: 90 }),
    onDeleteReport: vi.fn(),
    buildOptions: [],
    hiddenFieldOptions: { tag: [], priority: [], platform: [] },
    customFieldOptions: { tag: [], platform: [] },
    onFetchMembers: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
  render(<BugDetailPage {...props} />)
  return props
}

describe('BugDetailPage - no video', () => {
  it('shows the no-video hint and a 動画を追加 button instead of the video player', () => {
    renderPage()
    expect(screen.getByText(/録画・入力ログはありません/)).toBeInTheDocument()
    expect(screen.getByText('動画を追加')).toBeInTheDocument()
  })

  it('uploading a file via 動画を追加 calls onAttachVideo with the bug id and file', async () => {
    const user = userEvent.setup()
    const props = renderPage()

    const file = new File(['fake'], 'later.mp4', { type: 'video/mp4' })
    const input = document.querySelector('input[type="file"]')
    await user.upload(input, file)

    expect(props.onAttachVideo).toHaveBeenCalledWith(1, file)
  })

  it('shows an error message when attaching fails', async () => {
    const user = userEvent.setup()
    const props = renderPage({
      onAttachVideo: vi.fn().mockRejectedValue(new Error('動画の追加に失敗しました')),
    })

    const file = new File(['fake'], 'later.mp4', { type: 'video/mp4' })
    const input = document.querySelector('input[type="file"]')
    await user.upload(input, file)

    expect(await screen.findByText('動画の追加に失敗しました')).toBeInTheDocument()
  })
})
