import express from 'express'
import multer from 'multer'
import {
  listProjectsForUser,
  createProject,
  deleteProjects,
  isProjectMember,
  listProjectMembers,
  addProjectMembers,
  removeProjectMember,
  countProjectMembers,
} from '../data.js'
import { requireAuth } from '../auth.js'
import { saveImage, deleteFile } from '../storage.js'
import { asyncHandler } from '../asyncHandler.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get('/projects', requireAuth, (req, res) => {
  res.json(listProjectsForUser(req.user.email))
})

router.post(
  '/projects',
  requireAuth,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const { name } = req.body ?? {}
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' })
    }

    let imageUrl = null
    if (req.file) {
      ;({ imageUrl } = await saveImage(req.file.buffer, req.file.originalname))
    }

    const project = createProject({ name: name.trim(), imageUrl, creatorEmail: req.user.email })
    res.status(201).json(project)
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
    const authorizedIds = ids.filter((id) => isProjectMember(id, req.user.email))
    const { deletedProjectIds, deletedVideoUrls } = deleteProjects(authorizedIds)
    await Promise.all(deletedVideoUrls.map((url) => deleteFile(url)))

    res.json({ deletedProjectIds })
  })
)

router.get('/projects/:id/members', requireAuth, (req, res) => {
  const projectId = Number(req.params.id)
  if (!isProjectMember(projectId, req.user.email)) {
    return res.status(404).json({ error: 'not found' })
  }
  res.json(listProjectMembers(projectId))
})

router.post('/projects/:id/members', requireAuth, (req, res) => {
  const projectId = Number(req.params.id)
  if (!isProjectMember(projectId, req.user.email)) {
    return res.status(404).json({ error: 'not found' })
  }

  const { emails } = req.body ?? {}
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'emails must be a non-empty array' })
  }

  const added = addProjectMembers(projectId, emails)
  res.status(201).json({ added, members: listProjectMembers(projectId) })
})

router.delete('/projects/:id/members', requireAuth, (req, res) => {
  const projectId = Number(req.params.id)
  if (!isProjectMember(projectId, req.user.email)) {
    return res.status(404).json({ error: 'not found' })
  }

  const { email } = req.body ?? {}
  if (!email) {
    return res.status(400).json({ error: 'email is required' })
  }
  if (countProjectMembers(projectId) <= 1) {
    return res.status(400).json({ error: 'cannot remove the last member of a project' })
  }

  removeProjectMember(projectId, email)
  res.json({ members: listProjectMembers(projectId) })
})

export default router
