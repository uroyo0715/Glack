import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectsPage from './ProjectsPage.jsx'

const projects = [
  { id: 1, name: 'Nightfall Trail', imageUrl: null, bugCount: 9 },
  { id: 2, name: 'Second Game', imageUrl: 'https://example.com/img.png', bugCount: 0, gameEngine: 'godot' },
]

function renderPage(overrides = {}) {
  const props = {
    projects,
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn().mockResolvedValue({ deletedProjectIds: [] }),
    onOpenHelp: vi.fn(),
    onUpdateProject: vi.fn().mockResolvedValue({ id: 1, name: 'Nightfall Trail', imageUrl: 'blob:new' }),
    onRemoveImage: vi.fn().mockResolvedValue({ id: 2, name: 'Second Game', imageUrl: null }),
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

  it('shows a game engine badge only for projects that have one set', () => {
    renderPage()
    expect(screen.getByText('Godot')).toBeInTheDocument() // Second Gameのバッジ
    const nightfallCard = screen.getByText('Nightfall Trail').closest('.project-card')
    expect(within(nightfallCard).queryByText('Godot')).not.toBeInTheDocument()
    expect(within(nightfallCard).queryByText('Unity')).not.toBeInTheDocument()
  })

  it('opens the create form, then submits name + no image', async () => {
    const user = userEvent.setup()
    const props = renderPage({
      onCreate: vi.fn().mockResolvedValue({ id: 3, name: '新しいゲーム', imageUrl: null }),
    })

    await user.click(screen.getByRole('button', { name: /新規プロジェクト/ }))
    await user.type(screen.getByPlaceholderText('プロジェクト名'), '新しいゲーム')
    await user.click(screen.getByRole('button', { name: '作成' }))

    expect(props.onCreate).toHaveBeenCalledWith('新しいゲーム', null, '')
  })

  it('lets the user pick a game engine when creating a project', async () => {
    const user = userEvent.setup()
    const props = renderPage({
      onCreate: vi.fn().mockResolvedValue({ id: 3, name: 'Godotゲーム', imageUrl: null, gameEngine: 'godot' }),
    })

    await user.click(screen.getByRole('button', { name: /新規プロジェクト/ }))
    await user.type(screen.getByPlaceholderText('プロジェクト名'), 'Godotゲーム')
    await user.selectOptions(screen.getByDisplayValue('ゲームエンジン: 未設定'), 'Godot')
    await user.click(screen.getByRole('button', { name: '作成' }))

    expect(props.onCreate).toHaveBeenCalledWith('Godotゲーム', null, 'godot')
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

  describe('project edit', () => {
    it('opens the edit form via the icon button without opening the project, and submits the new name + image', async () => {
      const user = userEvent.setup()
      const props = renderPage()
      const card = screen.getByText('Nightfall Trail').closest('.project-card')

      await user.click(within(card).getByRole('button', { name: 'プロジェクトを編集' }))
      expect(props.onOpen).not.toHaveBeenCalled()

      const form = screen.getByPlaceholderText('プロジェクト名').closest('form')
      const nameInput = within(form).getByPlaceholderText('プロジェクト名')
      await user.clear(nameInput)
      await user.type(nameInput, 'リネーム後')

      const file = new File(['fake'], 'photo.png', { type: 'image/png' })
      const input = form.querySelector('input[type="file"]')
      await user.upload(input, file)

      await user.click(within(form).getByRole('button', { name: '保存' }))

      expect(props.onUpdateProject).toHaveBeenCalledWith(1, {
        name: 'リネーム後',
        imageFile: file,
        gameEngine: '',
      })
    })

    it('only shows the "画像を削除" action once a project has an image, and it calls onRemoveImage without closing the project', async () => {
      const user = userEvent.setup()
      const props = renderPage()

      const cardWithoutImage = screen.getByText('Nightfall Trail').closest('.project-card')
      await user.click(within(cardWithoutImage).getByRole('button', { name: 'プロジェクトを編集' }))
      expect(screen.queryByRole('button', { name: '画像を削除' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '取消' }))

      const cardWithImage = screen.getByText('Second Game').closest('.project-card')
      await user.click(within(cardWithImage).getByRole('button', { name: 'プロジェクトを編集' }))
      await user.click(screen.getByRole('button', { name: '画像を削除' }))

      expect(props.onRemoveImage).toHaveBeenCalledWith(2)
      expect(props.onOpen).not.toHaveBeenCalled()
    })

    it('pre-fills the game engine selector from the project and lets it be changed', async () => {
      const user = userEvent.setup()
      const props = renderPage()
      const card = screen.getByText('Second Game').closest('.project-card')

      await user.click(within(card).getByRole('button', { name: 'プロジェクトを編集' }))
      const form = screen.getByPlaceholderText('プロジェクト名').closest('form')
      expect(within(form).getByDisplayValue('Godot')).toBeInTheDocument()

      await user.selectOptions(within(form).getByDisplayValue('Godot'), 'Unity')
      await user.click(within(form).getByRole('button', { name: '保存' }))

      expect(props.onUpdateProject).toHaveBeenCalledWith(2, {
        name: 'Second Game',
        imageFile: null,
        gameEngine: 'unity',
      })
    })

    it('cancel closes the edit form without saving', async () => {
      const user = userEvent.setup()
      const props = renderPage()
      const card = screen.getByText('Nightfall Trail').closest('.project-card')

      await user.click(within(card).getByRole('button', { name: 'プロジェクトを編集' }))
      await user.click(screen.getByRole('button', { name: '取消' }))

      expect(screen.queryByPlaceholderText('プロジェクト名')).not.toBeInTheDocument()
      expect(props.onUpdateProject).not.toHaveBeenCalled()
    })
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
