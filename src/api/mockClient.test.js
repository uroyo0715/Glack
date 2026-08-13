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
    expect(byTag.every((b) => b.tags.includes('crash'))).toBe(true)

    const byProject = await client.fetchReports({ projectId: 1 })
    expect(byProject.length).toBe(all.length) // 現状の全シードデータはproject 1所属

    const byUnknownProject = await client.fetchReports({ projectId: 999 })
    expect(byUnknownProject).toEqual([])
  })

  it('fetchReports filters by assignee, including the __unassigned__ sentinel', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const all = await client.fetchReports()
    const [target] = all
    await client.updateReportFields(target.id, { assignee: 'yamada_dev' })

    const byAssignee = await client.fetchReports({ assignee: 'yamada_dev' })
    expect(byAssignee.some((b) => b.id === target.id)).toBe(true)
    expect(byAssignee.every((b) => b.assignee === 'yamada_dev')).toBe(true)

    const unassigned = await client.fetchReports({ assignee: '__unassigned__' })
    expect(unassigned.every((b) => !b.assignee)).toBe(true)
    expect(unassigned.some((b) => b.id === target.id)).toBe(false)
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

  it('fetchReportComments starts empty, and createReportComment appends comments in order', async () => {
    const client = await freshClient()
    const user = await client.loginWithGoogle()

    const [target] = await client.fetchReports()
    expect(await client.fetchReportComments(target.id)).toEqual([])

    const first = await client.createReportComment(target.id, '再現できました')
    expect(first.body).toBe('再現できました')
    expect(first.authorEmail).toBe(user.email)
    expect(first.authorDisplayName).toBe(user.displayName)
    expect(first.bugId).toBe(target.id)
    expect(first.createdAt).toBeTruthy()

    const second = await client.createReportComment(target.id, '私も確認しました')

    const comments = await client.fetchReportComments(target.id)
    expect(comments.map((c) => c.body)).toEqual(['再現できました', '私も確認しました'])
    expect(comments.map((c) => c.id)).toEqual([first.id, second.id])
  })

  it('createReportComment rejects an empty body and unknown report ids', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()
    const [target] = await client.fetchReports()

    await expect(client.createReportComment(target.id, '   ')).rejects.toThrow('body cannot be empty')
    await expect(client.createReportComment(999999, 'hi')).rejects.toThrow('not found')
  })

  it('createReportComment with a parentCommentId creates a reply, and rejects an unknown parent', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()
    const [target] = await client.fetchReports()

    const parent = await client.createReportComment(target.id, '親コメント')
    const reply = await client.createReportComment(target.id, '返信です', parent.id)
    expect(reply.parentCommentId).toBe(parent.id)

    const comments = await client.fetchReportComments(target.id)
    expect(comments.find((c) => c.id === parent.id).parentCommentId).toBeNull()
    expect(comments.find((c) => c.id === reply.id).parentCommentId).toBe(parent.id)

    await expect(client.createReportComment(target.id, 'x', 999999)).rejects.toThrow('unknown parentCommentId')
  })

  it('replying to a reply collapses to the top-level parent (max depth 1)', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()
    const [target] = await client.fetchReports()

    const parent = await client.createReportComment(target.id, '親コメント')
    const reply = await client.createReportComment(target.id, '返信', parent.id)
    const replyToReply = await client.createReportComment(target.id, '返信への返信', reply.id)

    expect(replyToReply.parentCommentId).toBe(parent.id) // reply.idではなくparent.idになる
  })

  it('deleteReportComment deletes the comment and cascades to its replies, and rejects unknown ids', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()
    const [target] = await client.fetchReports()

    const parent = await client.createReportComment(target.id, '親コメント')
    const reply = await client.createReportComment(target.id, '返信', parent.id)

    await expect(client.deleteReportComment(target.id, 999999)).rejects.toThrow('not found')

    const result = await client.deleteReportComment(target.id, parent.id)
    expect(result).toEqual({ deleted: true })

    const comments = await client.fetchReportComments(target.id)
    expect(comments.find((c) => c.id === parent.id)).toBeUndefined()
    expect(comments.find((c) => c.id === reply.id)).toBeUndefined() // 返信も連動削除
  })

  it('attachReportVideo sets videoUrl/fps/durationFrames on a report created with no video', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const created = await client.createManualReport(1, {
      title: 'テキストのみ報告',
      tags: ['crash'],
      desc: '説明',
      who: 'tester',
      build: '0.0.1',
      platform: 'PC',
    })
    expect(created.videoUrl).toBe('')

    const videoFile = new File(['fake'], 'later.mp4', { type: 'video/mp4' })
    const updated = await client.attachReportVideo(created.id, {
      videoFile,
      fps: 30,
      durationFrames: 90,
    })
    expect(updated.videoUrl).toBeTruthy()
    expect(updated.fps).toBe(30)
    expect(updated.durationFrames).toBe(90)

    const refetched = await client.fetchReport(created.id)
    expect(refetched.videoUrl).toBe(updated.videoUrl)
  })

  it('attachReportVideo rejects a missing file or non-positive fps/durationFrames, and unknown ids', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const created = await client.createManualReport(1, {
      title: 'テキストのみ報告2',
      tags: ['crash'],
      desc: '説明',
      who: 'tester',
      build: '0.0.1',
      platform: 'PC',
    })
    const videoFile = new File(['fake'], 'later.mp4', { type: 'video/mp4' })

    await expect(
      client.attachReportVideo(created.id, { videoFile: null, fps: 30, durationFrames: 90 })
    ).rejects.toThrow('video file is required')
    await expect(
      client.attachReportVideo(created.id, { videoFile, fps: 0, durationFrames: 90 })
    ).rejects.toThrow('fps and durationFrames must be positive numbers')
    await expect(
      client.attachReportVideo(999999, { videoFile, fps: 30, durationFrames: 90 })
    ).rejects.toThrow('not found')
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

  it('createProject defaults gameEngine to empty string, accepts a valid value, and updateProject can change it', async () => {
    const client = await freshClient()
    await client.loginWithGoogle()

    const defaultProject = await client.createProject('未指定ゲーム', null)
    expect(defaultProject.gameEngine).toBe('')

    const godotProject = await client.createProject('Godotゲーム', null, 'godot')
    expect(godotProject.gameEngine).toBe('godot')

    await expect(client.createProject('不正なゲーム', null, 'unreal')).rejects.toThrow('unknown gameEngine')

    const updated = await client.updateProject(godotProject.id, { gameEngine: 'unity' })
    expect(updated.gameEngine).toBe('unity')
    await expect(client.updateProject(godotProject.id, { gameEngine: 'unreal' })).rejects.toThrow(
      'unknown gameEngine'
    )
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
