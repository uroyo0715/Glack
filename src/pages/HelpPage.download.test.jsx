import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../api/index.js', () => ({
  sdkDownloadUrl: (engine) => `https://api.example.com/api/v1/sdk/${engine}`,
}))

const { default: HelpPage } = await import('./HelpPage.jsx')

describe('HelpPage SDK download buttons (backend configured)', () => {
  it('shows a Unity download link pointing at the SDK zip route', () => {
    render(<HelpPage />)
    const link = screen.getByText('Unity SDKをダウンロード（zip）')
    expect(link).toHaveAttribute('href', 'https://api.example.com/api/v1/sdk/unity')
  })

  it('shows a Godot download link pointing at the SDK zip route', () => {
    render(<HelpPage defaultEngine="godot" />)
    const link = screen.getByText('Godot SDKをダウンロード（zip）')
    expect(link).toHaveAttribute('href', 'https://api.example.com/api/v1/sdk/godot')
  })
})
