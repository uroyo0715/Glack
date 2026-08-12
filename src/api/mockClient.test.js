import { describe, it, expect, vi } from 'vitest'

// mockClient.js はモジュールスコープの可変配列（bugs/projects/currentUser）を持つため、
// テスト間で状態が漏れないよう毎回モジュールを再読み込みして新しいインスタンスを使う。
async function freshClient() {
  vi.resetModules()
  return await import('./mockClient.js')
}

describe('mockClient auth', () => {
  it('fetchReports/fetchReport/updateReportStatus/fetchProjects require login', async () => {
    const client = await freshClient()
    await expect(client.fetchReports()).rejects.toThrow('login required')
    await expect(client.fetchReport(1)).rejects.toThrow('login required')
    await expect(client.updateReportStatus(1, 'done')).rejects.toThrow('login required')
    await expect(client.fetchProjects()).rejects.toThrow('login required')
  })

  it('loginWithGoogle sets a demo user that me() then returns', async () => {
    const client = await freshClient()
    expect(await client.me()).toBeNull()

    const user = await client.loginWithGoogle()
    expect(user).toEqual({ email: 'demo@example.com', displayName: 'デモユーザー' })
    expect(await client.me()).toEqual(user)
  })

  it('updateDisplayName changes the current user and logout clears it', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const updated = await client.updateDisplayName('新しい名前')
    expect(updated.displayName).toBe('新しい名前')
    expect((await client.me()).displayName).toBe('新しい名前')

    await client.logout()
    expect(await client.me()).toBeNull()
  })
})

describe('mockClient reports', () => {
  it('fetchReports strips detail-only fields and filters by status/tag/projectId/q', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const all = await client.fetchReports()
    expect(all.length).toBeGreaterThan(0)
    expect(all[0].inputs).toBeUndefined()
    expect(all[0].videoUrl).toBeUndefined()

    const byStatus = await client.fetchReports({ status: 'todo' })
    expect(byStatus.length).toBeGreaterThan(0)
    expect(byStatus.every((b) => b.status === 'todo')).toBe(true)

    const byTag = await client.fetchReports({ tag: 'crash' })
    expect(byTag.every((b) => b.tag === 'crash')).toBe(true)

    const byProject = await client.fetchReports({ projectId: 1 })
    expect(byProject.length).toBe(all.length) // 現状の全シードデータはproject 1所属

    const byUnknownProject = await client.fetchReports({ projectId: 999 })
    expect(byUnknownProject).toEqual([])
  })

  it('fetchReport returns the full bug (including inputs) and rejects unknown ids', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const [first] = await client.fetchReports()
    const full = await client.fetchReport(first.id)
    expect(Array.isArray(full.inputs)).toBe(true)
    expect(full.videoUrl).toBeTruthy()

    await expect(client.fetchReport(999999)).rejects.toThrow()
  })

  it('updateReportStatus persists the new status for subsequent fetches', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const [target] = await client.fetchReports()
    const updated = await client.updateReportStatus(target.id, 'in_progress')
    expect(updated.status).toBe('in_progress')

    const refetched = await client.fetchReport(target.id)
    expect(refetched.status).toBe('in_progress')
  })
})

describe('mockClient projects', () => {
  it('fetchProjects returns the seed project with a bugCount', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const projects = await client.fetchProjects()
    const seed = projects.find((p) => p.name === 'Nightfall Trail')
    expect(seed).toBeTruthy()
    expect(seed.bugCount).toBeGreaterThan(0)
  })

  it('createProject adds a project without an image and it appears in fetchProjects', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const project = await client.createProject('新規ゲーム', null)
    expect(project.name).toBe('新規ゲーム')
    expect(project.imageUrl).toBeNull()

    const all = await client.fetchProjects()
    expect(all.some((p) => p.id === project.id)).toBe(true)
  })

  it('createProject rejects a blank name', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()
    await expect(client.createProject('   ', null)).rejects.toThrow('name is required')
  })

  it('deleteProjects removes the project and its bugs, leaving other projects untouched', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const seed = (await client.fetchProjects()).find((p) => p.name === 'Nightfall Trail')
    const other = await client.createProject('残る方', null)

    const result = await client.deleteProjects([seed.id])
    expect(result.deletedProjectIds).toEqual([seed.id])

    const remaining = await client.fetchProjects()
    expect(remaining.some((p) => p.id === seed.id)).toBe(false)
    expect(remaining.some((p) => p.id === other.id)).toBe(true)

    const remainingBugs = await client.fetchReports({ projectId: seed.id })
    expect(remainingBugs).toEqual([])
  })

  it('deleteProjects requires login', async () => {
    const client = await freshClient()
    await expect(client.deleteProjects([1])).rejects.toThrow('login required')
  })
})

describe('mockClient project members', () => {
  it('fetchProjectMembers returns the demo user for the seed project', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const seed = (await client.fetchProjects()).find((p) => p.name === 'Nightfall Trail')
    const members = await client.fetchProjectMembers(seed.id)
    expect(members).toEqual([{ email: 'demo@example.com', displayName: 'デモユーザー' }])
  })

  it('addProjectMembers adds new emails, dedupes, and normalizes case/whitespace', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const seed = (await client.fetchProjects()).find((p) => p.name === 'Nightfall Trail')
    const result = await client.addProjectMembers(seed.id, [' Alice@Example.com ', 'bob@example.com'])
    expect(result.added.sort()).toEqual(['alice@example.com', 'bob@example.com'])
    expect(result.members.map((m) => m.email).sort()).toEqual([
      'alice@example.com',
      'bob@example.com',
      'demo@example.com',
    ])

    const again = await client.addProjectMembers(seed.id, ['alice@example.com'])
    expect(again.added).toEqual([])
  })

  it('fetchProjectMembers/addProjectMembers require login', async () => {
    const client = await freshClient()
    await expect(client.fetchProjectMembers(1)).rejects.toThrow('login required')
    await expect(client.addProjectMembers(1, ['a@example.com'])).rejects.toThrow('login required')
  })
})
