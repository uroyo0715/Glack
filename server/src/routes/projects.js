import express from 'express'
import multer from 'multer'
import {
  listProjectsForUser,
  createProject,
  getProjectById,
  deleteProjects,
  deleteAllBugsForProject,
  isProjectMember,
  listProjectMembers,
  addProjectMembers,
  removeProjectMember,
  countProjectMembers,
  getProjectRaw,
  updateProjectStorageConfig,
  updateProjectFieldOptions,
  addProjectCustomOption,
  removeProjectCustomOption,
  updateProjectImage,
  updateProjectName,
} from '../data.js'
import { requireAuth } from '../auth.js'
import { saveImage, deleteFile } from '../storage.js'
import { asyncHandler } from '../asyncHandler.js'
import {
  resolveProjectDbClient,
  resolveProjectStorageConfig,
  encryptTursoConfig,
  encryptR2Config,
  toStorageStatus,
  invalidateProjectDataClientCache,
} from '../projectDataAccess.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get(
  '/projects',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await listProjectsForUser(req.user.email))
  })
)

router.post(
  '/projects',
  requireAuth,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const { name } = req.body ?? {}
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' })
    }

    // 新規プロジェクトは既定でstorageMode='self_hosted'・未設定のため、この時点ではまだ
    // 保存先が無い。カバー画像の設定は必須機能ではないので、その場合は黙って画像なしで作成する
    // （ストレージ設定後、あらためて編集で付けられるようにする想定。今回のスコープ外）。
    let imageUrl = null
    if (req.file) {
      const draftProject = { storageMode: 'self_hosted', isManagedAllowed: false, r2ConfigEnc: null }
      const target = resolveProjectStorageConfig(draftProject)
      if (target.ready) {
        ;({ imageUrl } = await saveImage(target, req.file.buffer, req.file.originalname))
      }
    }

    const project = await createProject({ name: name.trim(), imageUrl, creatorEmail: req.user.email })
    res.status(201).json(project)
  })
)

// 作成後に名前・ティザー画像をまとめて編集する（プロジェクト一覧カードの「編集」から使う）。
// どちらも省略可（渡した方だけ更新する部分更新）。画像を差し替える場合のみ、
// self_hostedでR2が未設定だと保存先が無いため409になる。
router.patch(
  '/projects/:id',
  requireAuth,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const { name } = req.body ?? {}
    if (name != null && !name.trim()) {
      return res.status(400).json({ error: 'name cannot be empty' })
    }

    const project = await getProjectRaw(projectId)

    if (req.file) {
      const storageTarget = resolveProjectStorageConfig(project)
      if (!storageTarget.ready) {
        return res.status(409).json({ error: 'storage not configured for this project', code: storageTarget.reason })
      }
      const oldImageUrl = project.imageUrl
      const { imageUrl } = await saveImage(storageTarget, req.file.buffer, req.file.originalname)
      await updateProjectImage(projectId, imageUrl)
      if (oldImageUrl) await deleteFile(storageTarget, oldImageUrl)
    }

    if (name != null && name.trim()) {
      await updateProjectName(projectId, name.trim())
    }

    res.json(await getProjectById(projectId))
  })
)

// 作成後にティザー画像を差し替える/外す。self_hostedでR2が未設定の間はまだ保存先が無いため409。
router.patch(
  '/projects/:id/image',
  requireAuth,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'image file is required' })
    }
    const project = await getProjectRaw(projectId)
    const storageTarget = resolveProjectStorageConfig(project)
    if (!storageTarget.ready) {
      return res.status(409).json({ error: 'storage not configured for this project', code: storageTarget.reason })
    }

    const oldImageUrl = project.imageUrl
    const { imageUrl } = await saveImage(storageTarget, req.file.buffer, req.file.originalname)
    const updated = await updateProjectImage(projectId, imageUrl)
    if (oldImageUrl) await deleteFile(storageTarget, oldImageUrl)

    res.json(updated)
  })
)

router.delete(
  '/projects/:id/image',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const project = await getProjectRaw(projectId)
    if (project.imageUrl) {
      const storageTarget = resolveProjectStorageConfig(project)
      if (storageTarget.ready) await deleteFile(storageTarget, project.imageUrl)
    }
    const updated = await updateProjectImage(projectId, null)
    res.json(updated)
  })
)

router.delete(
  '/projects',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { ids } = req.body ?? {}
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id))) {
      return res.status(400).json({ error: 'ids must be a non-empty array of integers' })
    }

    // 自分がメンバーではないプロジェクトは黙って無視する（他チームのプロジェクトを消せてしまわないように）
    const memberChecks = await Promise.all(ids.map((id) => isProjectMember(id, req.user.email)))
    const authorizedIds = ids.filter((_, i) => memberChecks[i])

    // バグデータの保存先はプロジェクトごとに違う（managed共有DB or self_hosted自前DB）ため、
    // コントロールプレーン側の一括削除の前に、プロジェクトごとに解決してから消す。
    for (const id of authorizedIds) {
      const project = await getProjectRaw(id)
      if (!project) continue

      const dbAccess = await resolveProjectDbClient(project)
      if (dbAccess.ready) {
        const { deletedVideoUrls } = await deleteAllBugsForProject(dbAccess.client, id)
        const storageTarget = resolveProjectStorageConfig(project)
        if (storageTarget.ready) {
          await Promise.all(deletedVideoUrls.map((url) => deleteFile(storageTarget, url)))
        }
      }
      invalidateProjectDataClientCache(id)
    }

    const { deletedProjectIds } = await deleteProjects(authorizedIds)
    res.json({ deletedProjectIds })
  })
)

router.get(
  '/projects/:id/members',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    res.json(await listProjectMembers(projectId))
  })
)

router.post(
  '/projects/:id/members',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }

    const { emails } = req.body ?? {}
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails must be a non-empty array' })
    }

    const added = await addProjectMembers(projectId, emails)
    res.status(201).json({ added, members: await listProjectMembers(projectId) })
  })
)

router.delete(
  '/projects/:id/members',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }

    const { email } = req.body ?? {}
    if (!email) {
      return res.status(400).json({ error: 'email is required' })
    }
    if ((await countProjectMembers(projectId)) <= 1) {
      return res.status(400).json({ error: 'cannot remove the last member of a project' })
    }

    await removeProjectMember(projectId, email)
    res.json({ members: await listProjectMembers(projectId) })
  })
)

// --- ストレージ設定（self_hosted接続情報 / managed切り替え） ---

router.get(
  '/projects/:id/storage',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const project = await getProjectRaw(projectId)
    res.json(toStorageStatus(project))
  })
)

router.patch(
  '/projects/:id/storage',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const project = await getProjectRaw(projectId)

    const { storageMode, turso, r2 } = req.body ?? {}
    const update = {}

    if (storageMode != null) {
      if (storageMode !== 'self_hosted' && storageMode !== 'managed') {
        return res.status(400).json({ error: `unknown storageMode: ${storageMode}` })
      }
      if (storageMode === 'managed' && !project.isManagedAllowed) {
        return res.status(403).json({ error: 'managed plan is not enabled for this project' })
      }
      update.storageMode = storageMode
    }

    if (turso != null) {
      if (!turso.url || !turso.authToken) {
        return res.status(400).json({ error: 'turso.url and turso.authToken are required' })
      }
      update.tursoConfigEnc = encryptTursoConfig({ url: turso.url, authToken: turso.authToken })
    }

    if (r2 != null) {
      const required = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket', 'publicUrl']
      const missing = required.filter((key) => !r2[key])
      if (missing.length > 0) {
        return res.status(400).json({ error: `r2 missing fields: ${missing.join(', ')}` })
      }
      update.r2ConfigEnc = encryptR2Config({
        accountId: r2.accountId,
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
        bucket: r2.bucket,
        publicUrl: r2.publicUrl,
      })
    }

    const updated = await updateProjectStorageConfig(projectId, update)
    invalidateProjectDataClientCache(projectId)
    res.json(toStorageStatus(updated))
  })
)

// --- 種類・優先度・プラットフォームのプルダウンで使わないプリセット項目を隠す設定 ---

const FIELD_OPTION_KEYS = ['tag', 'priority', 'platform']

router.patch(
  '/projects/:id/field-options',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }

    const body = req.body ?? {}
    const update = {}
    for (const key of Object.keys(body)) {
      if (!FIELD_OPTION_KEYS.includes(key)) {
        return res.status(400).json({ error: `unknown field: ${key}` })
      }
      if (!Array.isArray(body[key]) || !body[key].every((v) => typeof v === 'string')) {
        return res.status(400).json({ error: `${key} must be an array of strings` })
      }
      update[key] = body[key]
    }

    const updated = await updateProjectFieldOptions(projectId, update)
    res.json(updated.hiddenFieldOptions)
  })
)

// --- 種類・プラットフォームの独自プリセット項目（追加/削除） ---

const CUSTOM_OPTION_FIELDS = ['tag', 'platform']

router.post(
  '/projects/:id/custom-options',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const { field, value } = req.body ?? {}
    if (!CUSTOM_OPTION_FIELDS.includes(field)) {
      return res.status(400).json({ error: `unknown field: ${field}` })
    }
    if (typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ error: 'value must be a non-empty string' })
    }
    const updated = await addProjectCustomOption(projectId, field, value.trim())
    res.json(updated.customFieldOptions)
  })
)

router.delete(
  '/projects/:id/custom-options',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id)
    if (!(await isProjectMember(projectId, req.user.email))) {
      return res.status(404).json({ error: 'not found' })
    }
    const { field, value } = req.body ?? {}
    if (!CUSTOM_OPTION_FIELDS.includes(field)) {
      return res.status(400).json({ error: `unknown field: ${field}` })
    }
    if (typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ error: 'value must be a non-empty string' })
    }
    const updated = await removeProjectCustomOption(projectId, field, value.trim())
    res.json(updated.customFieldOptions)
  })
)

export default router
