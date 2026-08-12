import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from './LoginPage.jsx'

describe('LoginPage', () => {
  it('calls onGoogleLogin when the button is clicked', async () => {
    const user = userEvent.setup()
    const onGoogleLogin = vi.fn().mockResolvedValue({ email: 'a@example.com', displayName: 'A' })
    render(<LoginPage onGoogleLogin={onGoogleLogin} />)

    await user.click(screen.getByRole('button', { name: 'Googleでログイン' }))

    expect(onGoogleLogin).toHaveBeenCalledTimes(1)
  })

  it('shows an error message when the login promise rejects', async () => {
    const user = userEvent.setup()
    const onGoogleLogin = vi.fn().mockRejectedValue(new Error('接続に失敗しました'))
    render(<LoginPage onGoogleLogin={onGoogleLogin} />)

    await user.click(screen.getByRole('button', { name: 'Googleでログイン' }))

    expect(await screen.findByText('接続に失敗しました')).toBeInTheDocument()
    // 失敗後はボタンが再度押せる状態に戻る
    expect(screen.getByRole('button', { name: 'Googleでログイン' })).not.toBeDisabled()
  })

  it('disables the button while the login is in flight', async () => {
    const user = userEvent.setup()
    let resolveLogin
    const onGoogleLogin = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve
        })
    )
    render(<LoginPage onGoogleLogin={onGoogleLogin} />)

    await user.click(screen.getByRole('button', { name: 'Googleでログイン' }))

    expect(screen.getByRole('button', { name: '接続中...' })).toBeDisabled()

    resolveLogin({ email: 'a@example.com', displayName: 'A' })
    await waitFor(() => expect(onGoogleLogin).toHaveBeenCalledTimes(1))
  })
})
