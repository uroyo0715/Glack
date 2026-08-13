import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HelpPage from './HelpPage.jsx'

describe('HelpPage', () => {
  it('shows the Unity guide by default', () => {
    render(<HelpPage />)
    expect(screen.getByText('2. Unity側にGlank SDKを導入する')).toBeInTheDocument()
    expect(screen.queryByText('2. Godot側にGlank SDKを導入する')).not.toBeInTheDocument()
  })

  it('hides the SDK download buttons when there is no backend (mock mode)', () => {
    render(<HelpPage />)
    expect(screen.queryByText('Unity SDKをダウンロード（zip）')).not.toBeInTheDocument()
  })

  it('shows the Godot guide when defaultEngine="godot"', () => {
    render(<HelpPage defaultEngine="godot" />)
    expect(screen.getByText('2. Godot側にGlank SDKを導入する')).toBeInTheDocument()
    expect(screen.queryByText('2. Unity側にGlank SDKを導入する')).not.toBeInTheDocument()
  })

  it('lets the user switch between Unity and Godot guides', async () => {
    const user = userEvent.setup()
    render(<HelpPage />)

    expect(screen.getByText('2. Unity側にGlank SDKを導入する')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Godot' }))
    expect(screen.getByText('2. Godot側にGlank SDKを導入する')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Unity' }))
    expect(screen.getByText('2. Unity側にGlank SDKを導入する')).toBeInTheDocument()
  })
})
