import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectsPage from './ProjectsPage.jsx'

const projects = [
  { id: 1, name: 'Nightfall Trail', imageUrl: null, bugCount: 9 },
  { id: 2, name: 'Second Game', imageUrl: 'https://example.com/img.png', bugCount: 0 },
]

function renderPage(overrides = {}) {
  const props = {
    projects,
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn().mockResolvedValue({ deletedProjectIds: [] }),
    onOpenHelp: vi.fn(),
    ...overrides,
  }
  render(<ProjectsPage {...props} />)
  return props
}

describe('ProjectsPage', () => {
  it('renders project cards with their id, and opens on click', async () => {
    const user = userEvent.setup()
    const props = renderPage()

    expect(screen.getByText('Nightfall Trail')).toBeInTheDocument()
    expect(screen.getByText('ID: 1')).toBeInTheDocument()

    await user.click(screen.getByText('Nightfall Trail'))
    expect(props.onOpen).toHaveBeenCalledWith(1)
  })

  it('opens the create form, then submits name + no image', async () => {
    const user = userEvent.setup()
    const props = renderPage({
      onCreate: vi.fn().mockResolvedValue({ id: 3, name: '新しいゲーム', imageUrl: null }),
    })

    await user.click(screen.getByRole('button', { name: /新規プロジェクト/ }))
    await user.type(screen.getByPlaceholderText('プロジェクト名'), '新しいゲーム')
    await user.click(screen.getByRole('button', { name: '作成' }))

    expect(props.onCreate).toHaveBeenCalledWith('新しいゲーム', null)
  })

  it('disables submit until a name is entered, and cancel closes the form', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /新規プロジェクト/ }))
    expect(screen.getByRole('button', { name: '作成' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByPlaceholderText('プロジェクト名')).not.toBeInTheDocument()
  })

  it('shows an error message when creation fails', async () => {
    const user = userEvent.setup()
    renderPage({ onCreate: vi.fn().mockRejectedValue(new Error('作成に失敗しました')) })

    await user.click(screen.getByRole('button', { name: /新規プロジェクト/ }))
    await user.type(screen.getByPlaceholderText('プロジェクト名'), 'x')
    await user.click(screen.getByRole('button', { name: '作成' }))

    expect(await screen.findByText('作成に失敗しました')).toBeInTheDocument()
  })

  it('calls onOpenHelp when the help link is clicked', async () => {
    const user = userEvent.setup()
    const props = renderPage()

    await user.click(screen.getByRole('button', { name: /Unity連携の使い方/ }))
    expect(props.onOpenHelp).toHaveBeenCalledTimes(1)
  })

  describe('selection + delete', () => {
    it('entering selection mode hides the create card and clicking a card selects it instead of opening it', async () => {
      const user = userEvent.setup()
      const props = renderPage()

      await user.click(screen.getByRole('button', { name: '選択' }))
      expect(screen.queryByRole('button', { name: /新規プロジェクト/ })).not.toBeInTheDocument()

      await user.click(screen.getByText('Nightfall Trail'))
      expect(props.onOpen).not.toHaveBeenCalled()
    })

    it('shows a delete trigger with the selected count, and the confirmation mentions the affected bug count', async () => {
      const user = userEvent.setup()
      renderPage()

      await user.click(screen.getByRole('button', { name: '選択' }))
      await user.click(screen.getByText('Nightfall Trail'))

      const trigger = screen.getByRole('button', { name: '1件を削除' })
      await user.click(trigger)

      expect(screen.getByText(/9件のバグ報告/)).toBeInTheDocument()
    })

    it('confirming delete calls onDelete with the selected ids and exits selection mode on success', async () => {
      const user = userEvent.setup()
      const props = renderPage()

      await user.click(screen.getByRole('button', { name: '選択' }))
      await user.click(screen.getByText('Nightfall Trail'))
      await user.click(screen.getByRole('button', { name: '1件を削除' }))
      await user.click(screen.getByRole('button', { name: '削除する' }))

      expect(props.onDelete).toHaveBeenCalledWith([1])
      expect(await screen.findByRole('button', { name: '選択' })).toBeInTheDocument()
    })

    it('cancelling the confirmation keeps the selection and does not call onDelete', async () => {
      const user = userEvent.setup()
      const props = renderPage()

      await user.click(screen.getByRole('button', { name: '選択' }))
      await user.click(screen.getByText('Nightfall Trail'))
      await user.click(screen.getByRole('button', { name: '1件を削除' }))
      await user.click(screen.getByRole('button', { name: 'キャンセル' }))

      expect(props.onDelete).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: '1件を削除' })).toBeInTheDocument()
    })

    it('shows an error message when deletion fails', async () => {
      const user = userEvent.setup()
      renderPage({ onDelete: vi.fn().mockRejectedValue(new Error('削除に失敗しました')) })

      await user.click(screen.getByRole('button', { name: '選択' }))
      await user.click(screen.getByText('Nightfall Trail'))
      await user.click(screen.getByRole('button', { name: '1件を削除' }))
      await user.click(screen.getByRole('button', { name: '削除する' }))

      expect(await screen.findByText('削除に失敗しました')).toBeInTheDocument()
    })

    it('toggling selection off clears any selected ids', async () => {
      const user = userEvent.setup()
      renderPage()

      await user.click(screen.getByRole('button', { name: '選択' }))
      await user.click(screen.getByText('Nightfall Trail'))
      expect(screen.getByRole('button', { name: '1件を削除' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '選択を解除' }))
      await user.click(screen.getByRole('button', { name: '選択' }))
      expect(screen.queryByRole('button', { name: /件を削除/ })).not.toBeInTheDocument()
    })
  })
})
