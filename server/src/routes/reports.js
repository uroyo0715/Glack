import express from 'express'
import multer from 'multer'
import {
  listBugs,
  getBugById,
  updateBugStatus,
  updateBugFields,
  deleteBug,
  listReportFacets,
  createBug,
  resolveBugProjectId,
  getProjectRaw,
  isProjectMember,
  PRIORITY_LABELS,
} from '../data.js'
import { requireAuth } from '../auth.js'
import { saveVideo, deleteFile } from '../storage.js'
import { asyncHandler } from '../asyncHandler.js'
import {
  resolveProjectDbClient,
  resolveProjectStorageConfig,
  checkManagedStorageQuota,
  addManagedStorageUsage,
} from '../projectDataAccess.js'

const router = express.Router()

// メモリに受けてから storage.js 経由で保存先へ書き込む。保存先をS3等へ
// 差し替える際もここは変更不要（storage.js の実装だけ差し替える）。
const upload = multer({ storage: multer.memoryStorage() })

function requireApiKey(req, res, next) {
  const expected = process.env.GLANK_API_KEY
  if (!expected) return next() // 未設定の間は認証をスキップ（開発用）
  if (req.get('X-Glank-Key') !== expected) {
    return res.status(401).json({ error: 'invalid or missing X-Glank-Key' })
  }
  next()
}

// projectIdからそのプロジェクトのバグデータ用DBクライアントを解決する。
// self_hostedでまだTursoが未設定なら409で「使えない」ことを明示する（要件5）。
async function requireProjectDbClient(res, projectId) {
  const project = await getProjectRaw(projectId)
  if (!project) return null
  const access = await resolveProjectDbClient(project)
  if (!access.ready) {
    res.status(409).json({ error: 'database not configured for this project', code: access.reason })
    return null
  }
  return { project, client: access.client }
}

router.get(
  '/reports',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { projectId, status, tag, priority, platform, build, who, assignee, q } = req.query
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    if (!(await isProjectMember(Number(projectId), req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const resolved = await requireProjectDbClient(res, Number(projectId))
    if (!resolved) return
    res.json(
      await listBugs(resolved.client, {
        projectId: Number(projectId),
        status,
        tag,
        priority,
        platform,
        build,
        who,
        assignee,
        q,
      })
    )
  })
)

router.get(
  '/reports/facets',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { projectId } = req.query
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    if (!(await isProjectMember(Number(projectId), req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const resolved = await requireProjectDbClient(res, Number(projectId))
    if (!resolved) return
    res.json(await listReportFacets(resolved.client, Number(projectId)))
  })
)

router.get(
  '/reports/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const projectId = await resolveBugProjectId(id)
    if (!projectId || !(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const resolved = await requireProjectDbClient(res, projectId)
    if (!resolved) return
    const bug = await getBugById(resolved.client, id)
    if (!bug) return res.status(404).json({ error: 'not found' })
    res.json(bug)
  })
)

const EDITABLE_TEXT_FIELDS = ['title', 'desc', 'who', 'build', 'platform']

function isValidTags(tags) {
  return Array.isArray(tags) && tags.length > 0 && tags.every((t) => typeof t === 'string' && t.trim())
}

router.patch(
  '/reports/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const projectId = await resolveBugProjectId(id)
    if (!projectId || !(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const resolved = await requireProjectDbClient(res, projectId)
    if (!resolved) return
    const { client } = resolved

    const existing = await getBugById(client, id)
    if (!existing) return res.status(404).json({ error: 'not found' })

    const { status, title, tags, desc, who, assignee, build, platform, priority } = req.body ?? {}

    const emptyField = EDITABLE_TEXT_FIELDS.find((key) => req.body?.[key] === '')
    if (emptyField) {
      return res.status(400).json({ error: `${emptyField} cannot be empty` })
    }
    if (tags != null && !isValidTags(tags)) {
      return res.status(400).json({ error: 'tags must be a non-empty array of strings' })
    }
    if (priority != null && !PRIORITY_LABELS[priority]) {
      return res.status(400).json({ error: `unknown priority: ${priority}` })
    }

    const hasFieldUpdates = [title, tags, desc, who, assignee, build, platform, priority].some(
      (v) => v != null
    )

    let updated
    if (status) updated = await updateBugStatus(client, id, status)
    if (hasFieldUpdates) {
      updated = await updateBugFields(client, id, {
        title,
        tags,
        desc,
        who,
        assignee,
        build,
        platform,
        priority,
      })
    }
    if (!updated) {
      const { videoUrl, fps, durationFrames, inputs, ...existingListItem } = existing
      updated = existingListItem
    }
    res.json(updated)
  })
)

router.post(
  '/reports',
  requireApiKey,
  upload.single('video'),
  asyncHandler(async (req, res) => {
    let metadata
    try {
      metadata = JSON.parse(req.body.metadata ?? '{}')
    } catch {
      return res.status(400).json({ error: 'metadata must be valid JSON' })
    }

    const required = [
      'projectId',
      'title',
      'tags',
      'desc',
      'who',
      'build',
      'platform',
      'fps',
      'durationFrames',
    ]
    const missing = required.filter((key) => metadata[key] == null)
    if (missing.length > 0) {
      return res.status(400).json({ error: `missing fields: ${missing.join(', ')}` })
    }
    if (!isValidTags(metadata.tags)) {
      return res.status(400).json({ error: 'tags must be a non-empty array of strings' })
    }
    const project = await getProjectRaw(metadata.projectId)
    if (!project) {
      return res.status(400).json({ error: `unknown projectId: ${metadata.projectId}` })
    }
    const priority = metadata.priority || 'medium'
    if (!PRIORITY_LABELS[priority]) {
      return res.status(400).json({ error: `unknown priority: ${priority}` })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'video file is required' })
    }

    const dbAccess = await resolveProjectDbClient(project)
    if (!dbAccess.ready) {
      return res.status(409).json({ error: 'database not configured for this project', code: dbAccess.reason })
    }
    const storageTarget = resolveProjectStorageConfig(project)
    if (!storageTarget.ready) {
      return res.status(409).json({ error: 'storage not configured for this project', code: storageTarget.reason })
    }
    const quota = await checkManagedStorageQuota(project, req.file.size)
    if (!quota.ok) {
      return res.status(413).json({ error: 'storage quota exceeded', code: quota.reason })
    }

    const { videoUrl, bytes } = await saveVideo(storageTarget, req.file.buffer, req.file.originalname)
    if (storageTarget.managed) await addManagedStorageUsage(project.id, bytes)

    const bug = await createBug(dbAccess.client, {
      projectId: metadata.projectId,
      title: metadata.title,
      tags: metadata.tags,
      desc: metadata.desc,
      who: metadata.who,
      build: metadata.build,
      platform: metadata.platform,
      priority,
      videoUrl,
      videoBytes: bytes,
      fps: metadata.fps,
      durationFrames: metadata.durationFrames,
      inputs: Array.isArray(metadata.inputs) ? metadata.inputs : [],
    })
    res.status(201).json(bug)
  })
)

// Unity SDK（動画あり）とは別に、Web UIから動画なしで手動作成するための経路。
// Unity連携がまだの場合や、動画を取り損ねた場合のテキストのみ報告用。
router.post(
  '/reports/manual',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    const required = ['projectId', 'title', 'tags', 'desc', 'who', 'build', 'platform']
    const missing = required.filter((key) => body[key] == null || body[key] === '')
    if (missing.length > 0) {
      return res.status(400).json({ error: `missing fields: ${missing.join(', ')}` })
    }
    if (!isValidTags(body.tags)) {
      return res.status(400).json({ error: 'tags must be a non-empty array of strings' })
    }
    if (!(await isProjectMember(Number(body.projectId), req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const priority = body.priority || 'medium'
    if (!PRIORITY_LABELS[priority]) {
      return res.status(400).json({ error: `unknown priority: ${priority}` })
    }

    const resolved = await requireProjectDbClient(res, Number(body.projectId))
    if (!resolved) return

    const bug = await createBug(resolved.client, {
      projectId: Number(body.projectId),
      title: body.title,
      tags: body.tags,
      desc: body.desc,
      who: body.who,
      build: body.build,
      platform: body.platform,
      priority,
      videoUrl: '', // 動画なし。フロント側は空文字を「録画なし」として扱う
      fps: 0,
      durationFrames: 0,
      inputs: [],
    })
    res.status(201).json(bug)
  })
)

router.delete(
  '/reports/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const projectId = await resolveBugProjectId(id)
    if (!projectId || !(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const project = await getProjectRaw(projectId)
    const dbAccess = await resolveProjectDbClient(project)
    if (!dbAccess.ready) {
      return res.status(409).json({ error: 'database not configured for this project', code: dbAccess.reason })
    }

    const existing = await getBugById(dbAccess.client, id)
    if (!existing) return res.status(404).json({ error: 'not found' })

    const result = await deleteBug(dbAccess.client, id)
    if (result?.deletedVideoUrl) {
      const storageTarget = resolveProjectStorageConfig(project)
      if (storageTarget.ready) {
        await deleteFile(storageTarget, result.deletedVideoUrl)
        if (storageTarget.managed && result.deletedVideoBytes) {
          await addManagedStorageUsage(project.id, -result.deletedVideoBytes)
        }
      }
    }
    res.json({ deleted: true })
  })
)

export default router
