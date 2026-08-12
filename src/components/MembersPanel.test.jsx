import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MembersPanel from './MembersPanel.jsx'

describe('MembersPanel', () => {
  it('loads and displays the current members', async () => {
    const onFetchMembers = vi.fn().mockResolvedValue([
      { email: 'a@example.com', displayName: null },
      { email: 'b@example.com', displayName: null },
    ])
    render(
      <MembersPanel projectId={1} onFetchMembers={onFetchMembers} onAddMembers={vi.fn()} onRemoveMember={vi.fn()} />
    )

    expect(await screen.findByText('a@example.com')).toBeInTheDocument()
    expect(screen.getByText('b@example.com')).toBeInTheDocument()
    expect(onFetchMembers).toHaveBeenCalledWith(1)
  })

  it('shows an error when loading members fails', async () => {
    const onFetchMembers = vi.fn().mockRejectedValue(new Error('取得に失敗しました'))
    render(
      <MembersPanel projectId={1} onFetchMembers={onFetchMembers} onAddMembers={vi.fn()} onRemoveMember={vi.fn()} />
    )

    expect(await screen.findByText('取得に失敗しました')).toBeInTheDocument()
  })

  it('parses comma/newline separated emails and calls onAddMembers with the parsed list', async () => {
    const user = userEvent.setup()
    const onFetchMembers = vi.fn().mockResolvedValue([{ email: 'owner@example.com', displayName: null }])
    const onAddMembers = vi.fn().mockResolvedValue({
      added: ['a@example.com', 'b@example.com'],
      members: [
        { email: 'owner@example.com', displayName: null },
        { email: 'a@example.com', displayName: null },
        { email: 'b@example.com', displayName: null },
      ],
    })
    render(
      <MembersPanel
        projectId={1}
        onFetchMembers={onFetchMembers}
        onAddMembers={onAddMembers}
        onRemoveMember={vi.fn()}
      />
    )
    await screen.findByText('owner@example.com')

    await user.type(screen.getByPlaceholderText(/メールアドレスを改行/), 'a@example.com,\nb@example.com')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(onAddMembers).toHaveBeenCalledWith(1, ['a@example.com', 'b@example.com'])
    expect(await screen.findByText('a@example.com')).toBeInTheDocument()
  })

  it('shows an error message when adding members fails', async () => {
    const user = userEvent.setup()
    const onFetchMembers = vi.fn().mockResolvedValue([])
    const onAddMembers = vi.fn().mockRejectedValue(new Error('追加に失敗しました'))
    render(
      <MembersPanel
        projectId={1}
        onFetchMembers={onFetchMembers}
        onAddMembers={onAddMembers}
        onRemoveMember={vi.fn()}
      />
    )
    await screen.findByText('まだメンバーがいません')

    await user.type(screen.getByPlaceholderText(/メールアドレスを改行/), 'a@example.com')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(await screen.findByText('追加に失敗しました')).toBeInTheDocument()
  })

  it('disables the add button until at least one email is entered', async () => {
    const onFetchMembers = vi.fn().mockResolvedValue([])
    render(
      <MembersPanel projectId={1} onFetchMembers={onFetchMembers} onAddMembers={vi.fn()} onRemoveMember={vi.fn()} />
    )
    await screen.findByText('まだメンバーがいません')

    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled()
  })
})
