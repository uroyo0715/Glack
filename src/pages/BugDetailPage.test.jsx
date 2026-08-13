import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
    onFetchComments: vi.fn().mockResolvedValue([]),
    onCreateComment: vi.fn().mockResolvedValue({
      id: 1,
      bugId: 1,
      authorEmail: 'demo@example.com',
      authorDisplayName: 'デモユーザー',
      body: 'コメント本文',
      createdAt: '2026-08-13T00:00:00Z',
      parentCommentId: null,
    }),
    onDeleteComment: vi.fn().mockResolvedValue({ deleted: true }),
    currentUserEmail: 'demo@example.com',
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

describe('BugDetailPage - comment thread', () => {
  it('loads and shows existing comments', async () => {
    renderPage({
      onFetchComments: vi.fn().mockResolvedValue([
        {
          id: 1,
          bugId: 1,
          authorEmail: 'demo@example.com',
          authorDisplayName: 'デモユーザー',
          body: '再現できました',
          createdAt: '2026-08-13T00:00:00Z',
        },
      ]),
    })

    expect(await screen.findByText('再現できました')).toBeInTheDocument()
    expect(screen.getByText('デモユーザー')).toBeInTheDocument()
  })

  it('posts a new comment and appends it to the list', async () => {
    const user = userEvent.setup()
    const props = renderPage()

    await screen.findByText('まだコメントはありません。')
    await user.type(screen.getByPlaceholderText('コメントを入力...'), 'コメント本文')
    await user.click(screen.getByRole('button', { name: '投稿' }))

    expect(props.onCreateComment).toHaveBeenCalledWith(1, 'コメント本文')
    expect(await screen.findByText('コメント本文')).toBeInTheDocument()
  })

  it('shows an error message when posting a comment fails', async () => {
    const user = userEvent.setup()
    renderPage({
      onCreateComment: vi.fn().mockRejectedValue(new Error('コメントの投稿に失敗しました')),
    })

    await screen.findByText('まだコメントはありません。')
    await user.type(screen.getByPlaceholderText('コメントを入力...'), 'コメント本文')
    await user.click(screen.getByRole('button', { name: '投稿' }))

    expect(await screen.findByText('コメントの投稿に失敗しました')).toBeInTheDocument()
  })

  it('lets the user reply to a comment, nesting it under the parent', async () => {
    const user = userEvent.setup()
    const onCreateComment = vi.fn().mockResolvedValue({
      id: 2,
      bugId: 1,
      authorEmail: 'demo@example.com',
      authorDisplayName: 'デモユーザー',
      body: '返信です',
      createdAt: '2026-08-13T00:01:00Z',
      parentCommentId: 1,
    })
    const props = renderPage({
      onFetchComments: vi.fn().mockResolvedValue([
        {
          id: 1,
          bugId: 1,
          authorEmail: 'other@example.com',
          authorDisplayName: '他のユーザー',
          body: '親コメント',
          createdAt: '2026-08-13T00:00:00Z',
          parentCommentId: null,
        },
      ]),
      onCreateComment,
    })

    await screen.findByText('親コメント')
    await user.click(screen.getByRole('button', { name: '返信' }))
    await user.type(screen.getByPlaceholderText('返信を入力...'), '返信です')
    await user.click(screen.getByRole('button', { name: '返信する' }))

    expect(onCreateComment).toHaveBeenCalledWith(1, '返信です', 1)
    expect(await screen.findByText('返信です')).toBeInTheDocument()
  })

  it('only shows a delete button for the current user’s own comments, and removes it after confirming', async () => {
    const user = userEvent.setup()
    const onDeleteComment = vi.fn().mockResolvedValue({ deleted: true })
    renderPage({
      onFetchComments: vi.fn().mockResolvedValue([
        {
          id: 1,
          bugId: 1,
          authorEmail: 'other@example.com',
          authorDisplayName: '他のユーザー',
          body: '他人のコメント',
          createdAt: '2026-08-13T00:00:00Z',
          parentCommentId: null,
        },
        {
          id: 2,
          bugId: 1,
          authorEmail: 'demo@example.com',
          authorDisplayName: 'デモユーザー',
          body: '自分のコメント',
          createdAt: '2026-08-13T00:01:00Z',
          parentCommentId: null,
        },
      ]),
      onDeleteComment,
      currentUserEmail: 'demo@example.com',
    })

    await screen.findByText('他人のコメント')
    const commentThread = document.querySelector('.comment-thread')
    const deleteButtons = within(commentThread).getAllByRole('button', { name: '削除' })
    expect(deleteButtons).toHaveLength(1) // 自分のコメントの分だけ

    await user.click(deleteButtons[0])
    await user.click(screen.getByRole('button', { name: '削除する' }))

    expect(onDeleteComment).toHaveBeenCalledWith(1, 2)
    await screen.findByText('他人のコメント')
    expect(screen.queryByText('自分のコメント')).not.toBeInTheDocument()
  })
})
