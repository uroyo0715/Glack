import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// App.jsx -> api/index.js -> mockClient.js はモジュールスコープの可変状態（ログイン中ユーザー、
// バグ/プロジェクトの配列）を持つため、テストごとにモジュールを再読み込みして完全に独立させる。
let App
beforeEach(async () => {
  vi.resetModules()
  ;({ default: App } = await import('./App.jsx'))
})

// VITE_API_BASE_URL が未設定のテスト環境（.env.test参照）では src/api/index.js が
// 自動でモッククライアント（src/api/mockClient.js）にフォールバックするため、
// バックエンドなしでログイン〜プロジェクト〜バグ一覧〜詳細までの導線を通しで確認できる。
describe('App (mock client integration)', () => {
  it('walks through login → projects → bug list → bug detail → status change → back navigation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Googleでログイン' }))

    await screen.findByText('プロジェクト')
    await user.click(await screen.findByText('Nightfall Trail'))

    await screen.findByText('プロジェクト: Nightfall Trail')
    await user.click(await screen.findByText('崖から落ちた直後にゲームがフリーズする'))

    await screen.findByRole('heading', { name: '崖から落ちた直後にゲームがフリーズする' })
    const statusSelect = screen.getByRole('combobox')
    expect(statusSelect.value).toBe('todo')

    await user.selectOptions(statusSelect, '対応中')
    // ステータス変更はAPI往復（モックでも非同期）を経て反映されるため、即時ではなくwaitForで待つ
    await waitFor(() => expect(statusSelect.value).toBe('in_progress'))

    await user.click(screen.getByRole('button', { name: '← 一覧に戻る' }))
    await screen.findByText('プロジェクト: Nightfall Trail')

    await user.click(screen.getByRole('button', { name: '← プロジェクト一覧に戻る' }))
    await screen.findByText('プロジェクト')
    expect(await screen.findByText('Nightfall Trail')).toBeInTheDocument()
  })

  it('deletes a bug report from the detail page and returns to the list', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Googleでログイン' }))
    await user.click(await screen.findByText('Nightfall Trail'))
    await screen.findByText('プロジェクト: Nightfall Trail')
    await user.click(await screen.findByText('崖から落ちた直後にゲームがフリーズする'))

    await screen.findByRole('heading', { name: '崖から落ちた直後にゲームがフリーズする' })
    await user.click(screen.getByRole('button', { name: '削除' }))
    await user.click(screen.getByRole('button', { name: '削除する' }))

    await screen.findByText('プロジェクト: Nightfall Trail')
    expect(screen.queryByText('崖から落ちた直後にゲームがフリーズする')).not.toBeInTheDocument()
  })

  it('logs out back to the login screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Googleでログイン' }))
    await screen.findByText('デモユーザー')

    await user.click(screen.getByRole('button', { name: 'ログアウト' }))
    await screen.findByRole('button', { name: 'Googleでログイン' })
  })

  it('creates a new project from the projects screen and can open it', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Googleでログイン' }))
    await screen.findByText('Nightfall Trail')

    await user.click(screen.getByRole('button', { name: /新規プロジェクト/ }))
    await user.type(screen.getByPlaceholderText('プロジェクト名'), 'テストゲーム')
    await user.click(screen.getByRole('button', { name: '作成' }))

    const newCard = await screen.findByText('テストゲーム')
    await user.click(newCard)

    await screen.findByText('プロジェクト: テストゲーム')
  })

  it('blocks report features on a new (self_hosted, unconfigured) project until Turso is set up', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Googleでログイン' }))
    await screen.findByText('Nightfall Trail')

    await user.click(screen.getByRole('button', { name: /新規プロジェクト/ }))
    await user.type(screen.getByPlaceholderText('プロジェクト名'), '未設定ゲーム')
    await user.click(screen.getByRole('button', { name: '作成' }))
    await user.click(await screen.findByText('未設定ゲーム'))

    await screen.findByText('プロジェクト: 未設定ゲーム')
    // 新規プロジェクトはself_hosted・未設定から始まるため、報告機能はブロックされている
    await screen.findByText(/データベース（Turso）が設定されていない/)
    expect(screen.queryByPlaceholderText('タイトル・内容で検索...')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ストレージ設定を開く' }))
    await user.type(
      await screen.findByPlaceholderText(/Database URL/),
      'libsql://example-team-db.turso.io'
    )
    await user.type(screen.getByPlaceholderText('Auth Token'), 'dummy-token')
    await user.click(screen.getByRole('button', { name: 'Tursoの接続情報を保存' }))

    // 設定後はブロック解除され、通常の一覧UIが使えるようになる
    await screen.findByPlaceholderText('タイトル・内容で検索...')
    expect(screen.queryByText(/データベース（Turso）が設定されていない/)).not.toBeInTheDocument()
  })

  it('deletes a project (and its bugs) from the projects screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Googleでログイン' }))
    await screen.findByText('Nightfall Trail')

    // 削除対象にしない2件目のプロジェクトを作っておき、削除後も残ることを確認する
    await user.click(screen.getByRole('button', { name: /新規プロジェクト/ }))
    await user.type(screen.getByPlaceholderText('プロジェクト名'), '残す方')
    await user.click(screen.getByRole('button', { name: '作成' }))
    await screen.findByText('残す方')

    await user.click(screen.getByRole('button', { name: '選択' }))
    await user.click(screen.getByText('Nightfall Trail'))
    await user.click(await screen.findByRole('button', { name: '1件を削除' }))
    expect(screen.getByText(/バグ報告/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(screen.queryByText('Nightfall Trail')).not.toBeInTheDocument())
    expect(screen.getByText('残す方')).toBeInTheDocument()
  })

  it('opens the members panel from the bug list and invites a new member', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Googleでログイン' }))
    await user.click(await screen.findByText('Nightfall Trail'))
    await screen.findByText('プロジェクト: Nightfall Trail')

    await user.click(screen.getByRole('button', { name: 'メンバー' }))
    expect(await screen.findByText('デモユーザー')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/メールアドレスを改行/), 'teammate@example.com')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(await screen.findByText('teammate@example.com')).toBeInTheDocument()
  })

  it('navigates back to the project list when the user removes themselves from a project', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Googleでログイン' }))
    await user.click(await screen.findByText('Nightfall Trail'))
    await screen.findByText('プロジェクト: Nightfall Trail')

    await user.click(screen.getByRole('button', { name: 'メンバー' }))
    // ヘッダーの表示名ボタン・招待用テキストエリアにも同じ文字列が出うるため、
    // 実際のメンバー一覧（ul.members-list）に絞り込んで待つ
    const getMembersList = () => document.querySelector('.members-list')
    await waitFor(() => expect(getMembersList()).not.toBeNull())
    await within(getMembersList()).findByText('デモユーザー')

    // 自分だけだと「最後の1人」削除になってしまうため、先にもう1人招待しておく
    await user.type(screen.getByPlaceholderText(/メールアドレスを改行/), 'teammate@example.com')
    await user.click(screen.getByRole('button', { name: '追加' }))
    await within(getMembersList()).findByText('teammate@example.com')

    const removeButtons = within(getMembersList()).getAllByTitle('メンバーを削除')
    const selfRemoveButton = removeButtons.find((btn) => btn.closest('li')?.textContent.includes('デモユーザー'))
    await user.click(selfRemoveButton)

    // プロジェクト一覧へ戻り、アクセスを失ったプロジェクトはカードとしても表示されなくなる
    await waitFor(() => expect(screen.queryByText('プロジェクト: Nightfall Trail')).not.toBeInTheDocument())
    await screen.findByText('新規プロジェクト') // プロジェクト一覧画面に戻っていることの確認
    expect(screen.queryByText('Nightfall Trail')).not.toBeInTheDocument()
  })

  it('lets the user rename their display name from the header', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Googleでログイン' }))
    await user.click(await screen.findByRole('button', { name: 'デモユーザー' }))

    const input = screen.getByDisplayValue('デモユーザー')
    await user.clear(input)
    await user.type(input, '改名後')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('button', { name: '改名後' })).toBeInTheDocument()
  })
})
