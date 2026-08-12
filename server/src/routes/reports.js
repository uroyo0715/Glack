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
  getProjectById,
  isProjectMember,
  resolveTagLabel,
  FREQUENCY_LABELS,
} from '../data.js'
import { requireAuth } from '../auth.js'
import { saveVideo, deleteFile } from '../storage.js'
import { asyncHandler } from '../asyncHandler.js'

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

router.get(
  '/reports',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { projectId, status, tag, platform, build, who, q } = req.query
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    if (!(await isProjectMember(Number(projectId), req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    res.json(await listBugs({ projectId: Number(projectId), status, tag, platform, build, who, q }))
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
    res.json(await listReportFacets(Number(projectId)))
  })
)

router.get(
  '/reports/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const bug = await getBugById(Number(req.params.id))
    if (!bug || !(await isProjectMember(bug.projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    res.json(bug)
  })
)

const EDITABLE_TEXT_FIELDS = ['title', 'tag', 'desc', 'who', 'build', 'platform']

router.patch(
  '/reports/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const existing = await getBugById(id)
    if (!existing || !(await isProjectMember(existing.projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const { status, title, tag, desc, who, build, platform, frequency } = req.body ?? {}

    const emptyField = EDITABLE_TEXT_FIELDS.find((key) => req.body?.[key] === '')
    if (emptyField) {
      return res.status(400).json({ error: `${emptyField} cannot be empty` })
    }
    if (frequency != null && !FREQUENCY_LABELS[frequency]) {
      return res.status(400).json({ error: `unknown frequency: ${frequency}` })
    }

    const hasFieldUpdates = [title, tag, desc, who, build, platform, frequency].some((v) => v != null)

    let updated
    if (status) updated = await updateBugStatus(id, status)
    if (hasFieldUpdates) {
      updated = await updateBugFields(id, { title, tag, desc, who, build, platform, frequency })
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
      'tag',
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
    if (!(await getProjectById(metadata.projectId))) {
      return res.status(400).json({ error: `unknown projectId: ${metadata.projectId}` })
    }
    const frequency = metadata.frequency || 'unknown'
    if (!FREQUENCY_LABELS[frequency]) {
      return res.status(400).json({ error: `unknown frequency: ${frequency}` })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'video file is required' })
    }

    const { videoUrl } = await saveVideo(req.file.buffer, req.file.originalname)

    const bug = await createBug({
      projectId: metadata.projectId,
      title: metadata.title,
      tag: metadata.tag,
      tagLabel: resolveTagLabel(metadata.tag),
      desc: metadata.desc,
      who: metadata.who,
      build: metadata.build,
      platform: metadata.platform,
      frequency,
      videoUrl,
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
    const required = ['projectId', 'title', 'tag', 'desc', 'who', 'build', 'platform']
    const missing = required.filter((key) => body[key] == null || body[key] === '')
    if (missing.length > 0) {
      return res.status(400).json({ error: `missing fields: ${missing.join(', ')}` })
    }
    if (!(await isProjectMember(Number(body.projectId), req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const frequency = body.frequency || 'unknown'
    if (!FREQUENCY_LABELS[frequency]) {
      return res.status(400).json({ error: `unknown frequency: ${frequency}` })
    }

    const bug = await createBug({
      projectId: Number(body.projectId),
      title: body.title,
      tag: body.tag,
      tagLabel: resolveTagLabel(body.tag),
      desc: body.desc,
      who: body.who,
      build: body.build,
      platform: body.platform,
      frequency,
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
    const existing = await getBugById(id)
    if (!existing || !(await isProjectMember(existing.projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const result = await deleteBug(id)
    if (result?.deletedVideoUrl) {
      await deleteFile(result.deletedVideoUrl)
    }
    res.json({ deleted: true })
  })
)

export default router
