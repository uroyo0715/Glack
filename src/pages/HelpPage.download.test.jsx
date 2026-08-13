import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../api/index.js', () => ({
  sdkDownloadUrl: (engine) => `https://api.example.com/api/v1/sdk/${engine}`,
}))

const { default: HelpPage } = await import('./HelpPage.jsx')

function renderHelpPage(props) {
  return render(
    <MemoryRouter>
      <HelpPage {...props} />
    </MemoryRouter>
  )
}

describe('HelpPage SDK download buttons (backend configured)', () => {
  it('shows a Unity download link pointing at the SDK zip route', () => {
    renderHelpPage()
    const link = screen.getByText('Unity SDKをダウンロード（zip）')
    expect(link).toHaveAttribute('href', 'https://api.example.com/api/v1/sdk/unity')
  })

  it('shows a Godot download link pointing at the SDK zip route', () => {
    renderHelpPage({ defaultEngine: 'godot' })
    const link = screen.getByText('Godot SDKをダウンロード（zip）')
    expect(link).toHaveAttribute('href', 'https://api.example.com/api/v1/sdk/godot')
  })
})
