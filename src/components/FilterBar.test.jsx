import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterBar from './FilterBar.jsx'
import { STATUS_COLUMNS, TAG_OPTIONS, PRIORITY_OPTIONS } from '../data/mockBugs.js'

const ALL_STATUS = STATUS_COLUMNS.map((s) => s.key)
const ALL_TAGS = TAG_OPTIONS.map((t) => t.key)
const ALL_PRIORITIES = PRIORITY_OPTIONS.map((p) => p.key)

function setup(overrides = {}) {
  const props = {
    query: '',
    setQuery: vi.fn(),
    statusFilter: ALL_STATUS,
    toggleStatus: vi.fn(),
    tagFilter: ALL_TAGS,
    toggleTag: vi.fn(),
    priorityFilter: ALL_PRIORITIES,
    togglePriority: vi.fn(),
    buildFilter: '',
    setBuildFilter: vi.fn(),
    whoFilter: '',
    setWhoFilter: vi.fn(),
    reportFacets: { builds: [], whos: [], tags: [] },
    hiddenFieldOptions: { tag: [], priority: [], platform: [] },
    customFieldOptions: { tag: [], platform: [] },
    resultCount: 9,
    ...overrides,
  }
  render(<FilterBar {...props} />)
  return props
}

describe('FilterBar', () => {
  it('shows the result count', () => {
    setup({ resultCount: 3 })
    expect(screen.getByText('3件')).toBeInTheDocument()
  })

  it('calls setQuery as the user types in the search box', async () => {
    const user = userEvent.setup()
    const props = setup()
    await user.type(screen.getByPlaceholderText('タイトル・内容で検索...'), 'x')
    expect(props.setQuery).toHaveBeenCalledWith('x')
  })

  it('calls toggleStatus with the clicked status key', async () => {
    const user = userEvent.setup()
    const props = setup()
    await user.click(screen.getByRole('button', { name: STATUS_COLUMNS[0].label }))
    expect(props.toggleStatus).toHaveBeenCalledWith(STATUS_COLUMNS[0].key)
  })

  it('calls toggleTag with the clicked tag key', async () => {
    const user = userEvent.setup()
    const props = setup()
    await user.click(screen.getByRole('button', { name: TAG_OPTIONS[0].label }))
    expect(props.toggleTag).toHaveBeenCalledWith(TAG_OPTIONS[0].key)
  })

  it('calls togglePriority with the clicked priority key', async () => {
    const user = userEvent.setup()
    const props = setup()
    await user.click(screen.getByRole('button', { name: PRIORITY_OPTIONS[0].label }))
    expect(props.togglePriority).toHaveBeenCalledWith(PRIORITY_OPTIONS[0].key)
  })

  it('marks active status/tag/priority chips based on the current filters', () => {
    setup({ statusFilter: [STATUS_COLUMNS[0].key], tagFilter: [], priorityFilter: [] })
    expect(screen.getByRole('button', { name: STATUS_COLUMNS[0].label })).toHaveClass('active')
    expect(screen.getByRole('button', { name: STATUS_COLUMNS[1].label })).not.toHaveClass('active')
    expect(screen.getByRole('button', { name: TAG_OPTIONS[0].label })).not.toHaveClass('active')
    expect(screen.getByRole('button', { name: PRIORITY_OPTIONS[0].label })).not.toHaveClass('active')
  })

  it('lists build/who facet options as dropdowns and calls the setters on change', async () => {
    const user = userEvent.setup()
    const props = setup({ reportFacets: { builds: ['0.1.0', '0.2.0'], whos: ['alice', 'bob'], tags: [] } })

    await user.selectOptions(screen.getByDisplayValue('ビルド: すべて'), '0.2.0')
    expect(props.setBuildFilter).toHaveBeenCalledWith('0.2.0')

    await user.selectOptions(screen.getByDisplayValue('報告者: すべて'), 'bob')
    expect(props.setWhoFilter).toHaveBeenCalledWith('bob')
  })

  it('does not render a chip for a preset tag hidden via hiddenFieldOptions', () => {
    setup({ hiddenFieldOptions: { tag: [TAG_OPTIONS[0].key], priority: [], platform: [] } })
    expect(screen.queryByRole('button', { name: TAG_OPTIONS[0].label })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: TAG_OPTIONS[1].label })).toBeInTheDocument()
  })

  it('renders chips for project custom tags and for freely-typed tags actually used in reports', () => {
    setup({
      customFieldOptions: { tag: ['バランス調整'], platform: [] },
      reportFacets: { builds: [], whos: [], tags: ['サウンド不具合'] },
    })
    expect(screen.getByRole('button', { name: 'バランス調整' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'サウンド不具合' })).toBeInTheDocument()
  })
})
