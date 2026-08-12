import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewReportForm from './NewReportForm.jsx'

function setup(overrides = {}) {
  const props = {
    projectId: 1,
    defaultWho: '',
    buildOptions: ['0.1.0', '0.2.0'],
    // 種類のプリセットは既定で空なので、プリセットボタンのトグル動作を検証するテストでは
    // このプロジェクトが「選択肢の管理」で追加した独自項目という想定で渡す。
    customFieldOptions: { tag: ['crash', 'visual'], platform: [] },
    onFetchMembers: vi.fn().mockResolvedValue([
      { email: 'a@example.com', displayName: 'アリス' },
      { email: 'b@example.com', displayName: 'ボブ' },
    ]),
    onCreate: vi.fn().mockResolvedValue({ id: 1 }),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<NewReportForm {...props} />)
  return props
}

describe('NewReportForm build/who/platform combo fields', () => {
  it('lists member display names and platform options as dropdowns by default', async () => {
    setup()
    expect(await screen.findByText('アリス')).toBeInTheDocument()
    expect(screen.getByText('PlayStation')).toBeInTheDocument()
    expect(screen.getByText('0.2.0')).toBeInTheDocument()
  })

  it('lets the user pick a member name from the dropdown for 報告者', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText('アリス')

    const whoSelect = screen.getByDisplayValue('メンバーから選択')
    await user.selectOptions(whoSelect, 'ボブ')
    expect(whoSelect).toHaveValue('ボブ')
  })

  it('switches プラットフォーム to manual text input and back to dropdown', async () => {
    const user = userEvent.setup()
    setup()

    const platformSelect = screen.getByDisplayValue('選択してください')
    await user.selectOptions(platformSelect, '直接入力する')
    const manualInput = screen.getByPlaceholderText('例: PC (Steam)')
    await user.type(manualInput, 'PC (Epic Games)')
    expect(manualInput).toHaveValue('PC (Epic Games)')

    await user.click(screen.getByRole('button', { name: 'プルダウンから選ぶ' }))
    expect(screen.queryByPlaceholderText('例: PC (Steam)')).not.toBeInTheDocument()
  })

  it('lets the user pick multiple preset 種類 tags and add a custom one', async () => {
    const user = userEvent.setup()
    const props = setup()
    await screen.findByText('アリス')

    const titleInput = screen.getAllByRole('textbox')[0]
    await user.type(titleInput, 'サウンド関連のバグ')
    const descInput = document.querySelector('textarea')
    await user.type(descInput, '効果音が二重に鳴る')

    // プリセットの種類は複数トグルできる
    await user.click(screen.getByRole('button', { name: 'crash' }))
    await user.click(screen.getByRole('button', { name: 'visual' }))

    // プリセットにない種類はテキスト入力から追加する
    const tagInput = screen.getByPlaceholderText('例: サウンド不具合')
    await user.type(tagInput, 'サウンド不具合')
    await user.click(screen.getByRole('button', { name: '追加' }))

    await user.selectOptions(screen.getByDisplayValue('メンバーから選択'), 'アリス')
    await user.selectOptions(screen.getByDisplayValue('既存のビルドから選択'), '0.1.0')
    await user.selectOptions(screen.getByDisplayValue('選択してください'), 'PC')

    await user.click(screen.getByRole('button', { name: '作成' }))

    expect(props.onCreate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ tags: ['crash', 'visual', 'サウンド不具合'] })
    )
  })

  it('submits with a build chosen from the dropdown', async () => {
    const user = userEvent.setup()
    const props = setup()
    await screen.findByText('アリス')

    const titleInput = screen.getAllByRole('textbox')[0]
    await user.type(titleInput, 'テストタイトル')
    const descInput = document.querySelector('textarea')
    await user.type(descInput, 'テスト詳細')

    await user.click(screen.getByRole('button', { name: 'crash' }))
    await user.selectOptions(screen.getByDisplayValue('メンバーから選択'), 'アリス')
    await user.selectOptions(screen.getByDisplayValue('既存のビルドから選択'), '0.1.0')
    await user.selectOptions(screen.getByDisplayValue('選択してください'), 'Switch2')

    await user.click(screen.getByRole('button', { name: '作成' }))

    expect(props.onCreate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ title: 'テストタイトル', who: 'アリス', build: '0.1.0', platform: 'Switch2' })
    )
  })

  it('adding a custom 種類 tag does not submit the surrounding form (regression: nested <form>)', async () => {
    const user = userEvent.setup()
    const props = setup()
    await screen.findByText('アリス')

    // すべての必須項目を先に埋めてから、最後にタグを追加するケース（追加ボタンが所属する
    // <form>が外側の新規報告フォームに入れ子になっていると、submitイベントが外側までバブルして
    // 意図せず報告が送信されてしまっていた）。
    const titleInput = screen.getAllByRole('textbox')[0]
    await user.type(titleInput, 'テストタイトル')
    const descInput = document.querySelector('textarea')
    await user.type(descInput, 'テスト詳細')
    await user.click(screen.getByRole('button', { name: 'crash' }))
    await user.selectOptions(screen.getByDisplayValue('メンバーから選択'), 'アリス')
    await user.selectOptions(screen.getByDisplayValue('既存のビルドから選択'), '0.1.0')
    await user.selectOptions(screen.getByDisplayValue('選択してください'), 'PC')

    const tagInput = screen.getByPlaceholderText('例: サウンド不具合')
    await user.type(tagInput, 'サウンド不具合')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(props.onCreate).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByText('サウンド不具合')).toBeInTheDocument()
  })

  it('hides preset options a project has disabled via hiddenFieldOptions, but keeps the current value visible', async () => {
    setup({ hiddenFieldOptions: { tag: [], priority: ['high'], platform: ['Xbox'] } })
    await screen.findByText('アリス')

    // 優先度の初期値は「中」なので、非表示にされた「高」だけプルダウンから消える
    expect(screen.queryByText('高')).not.toBeInTheDocument()
    expect(screen.getByText('中')).toBeInTheDocument()

    // プラットフォームは何も選ばれていないので、非表示にした項目はそのまま消える
    expect(screen.queryByText('Xbox')).not.toBeInTheDocument()
    expect(screen.getByText('PlayStation')).toBeInTheDocument()
  })
})
