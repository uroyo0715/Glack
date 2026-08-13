import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterBar from './FilterBar.jsx'
import { STATUS_COLUMNS, PRIORITY_OPTIONS } from '../data/mockBugs.js'

const ALL_STATUS = STATUS_COLUMNS.map((s) => s.key)
const ALL_PRIORITIES = PRIORITY_OPTIONS.map((p) => p.key)

// 種類のプリセットは既定で空なので、テストでは「このプロジェクトが選択肢の管理で
// 追加した独自項目」という想定でタグを用意する。
const TEST_TAGS = ['crash', 'visual']

function setup(overrides = {}) {
  const props = {
    query: '',
    setQuery: vi.fn(),
    statusFilter: ALL_STATUS,
    toggleStatus: vi.fn(),
    tagFilter: TEST_TAGS,
    toggleTag: vi.fn(),
    priorityFilter: ALL_PRIORITIES,
    togglePriority: vi.fn(),
    buildFilter: '',
    setBuildFilter: vi.fn(),
    whoFilter: '',
    setWhoFilter: vi.fn(),
    assigneeFilter: '',
    setAssigneeFilter: vi.fn(),
    reportFacets: { builds: [], whos: [], assignees: [], tags: [] },
    hiddenFieldOptions: { tag: [], priority: [], platform: [] },
    customFieldOptions: { tag: TEST_TAGS, platform: [] },
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
    await user.click(screen.getByRole('button', { name: TEST_TAGS[0] }))
    expect(props.toggleTag).toHaveBeenCalledWith(TEST_TAGS[0])
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
    expect(screen.getByRole('button', { name: TEST_TAGS[0] })).not.toHaveClass('active')
    expect(screen.getByRole('button', { name: PRIORITY_OPTIONS[0].label })).not.toHaveClass('active')
  })

  it('lists build/who facet options as dropdowns and calls the setters on change', async () => {
    const user = userEvent.setup()
    const props = setup({ reportFacets: { builds: ['0.1.0', '0.2.0'], whos: ['alice', 'bob'], tags: [] } })

    await user.selectOptions(screen.getByLabelText('ビルド:'), '0.2.0')
    expect(props.setBuildFilter).toHaveBeenCalledWith('0.2.0')

    await user.selectOptions(screen.getByLabelText('報告者:'), 'bob')
    expect(props.setWhoFilter).toHaveBeenCalledWith('bob')
  })

  it('lists 対応者 facet options as a dropdown and calls the setter on change', async () => {
    const user = userEvent.setup()
    const props = setup({
      reportFacets: { builds: [], whos: [], assignees: ['yamada_dev', 'sato_playtest'], tags: [] },
    })

    await user.selectOptions(screen.getByLabelText('対応者:'), 'yamada_dev')
    expect(props.setAssigneeFilter).toHaveBeenCalledWith('yamada_dev')
  })

  it('lets the user filter by 未割り当て (unassigned)', async () => {
    const user = userEvent.setup()
    const props = setup()

    await user.selectOptions(screen.getByLabelText('対応者:'), '未割り当て')
    expect(props.setAssigneeFilter).toHaveBeenCalledWith('__unassigned__')
  })

  it('keeps the ビルド/報告者/対応者 labels visible even after a value is selected', () => {
    setup({
      buildFilter: '0.2.0',
      reportFacets: { builds: ['0.2.0'], whos: [], assignees: [], tags: [] },
    })
    expect(screen.getByText('ビルド:')).toBeInTheDocument()
    expect(screen.getByText('報告者:')).toBeInTheDocument()
    expect(screen.getByText('対応者:')).toBeInTheDocument()
  })

  it('does not render a chip for a tag hidden via hiddenFieldOptions', () => {
    setup({ hiddenFieldOptions: { tag: [TEST_TAGS[0]], priority: [], platform: [] } })
    expect(screen.queryByRole('button', { name: TEST_TAGS[0] })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: TEST_TAGS[1] })).toBeInTheDocument()
  })

  it('renders chips for project custom tags and for freely-typed tags actually used in reports', () => {
    setup({
      customFieldOptions: { tag: ['バランス調整'], platform: [] },
      reportFacets: { builds: [], whos: [], tags: ['サウンド不具合'] },
    })
    expect(screen.getByRole('button', { name: 'バランス調整' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'サウンド不具合' })).toBeInTheDocument()
  })

  it('does not apply a color class to tag chips (only 状況 gets a fixed color language)', () => {
    setup()
    const chip = screen.getByRole('button', { name: TEST_TAGS[0] })
    expect(chip.className).not.toMatch(/status-chip/)
  })
})
