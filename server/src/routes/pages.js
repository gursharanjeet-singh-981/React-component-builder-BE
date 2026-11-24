import { Router } from 'express'
import { prisma } from '../database.js'
import {
  ApiError,
  asyncHandler,
  requireJson,
  requireText,
} from '../api-utils.js'

const router = Router()
const pageStatuses = new Set(['DRAFT', 'PUBLISHED'])

async function requireOwnedPage(id, userId) {
  const page = await prisma.page.findFirst({ where: { id, userId } })
  if (!page) {
    throw new ApiError(404, 'NOT_FOUND', 'Page was not found.')
  }
  return page
}

async function requireOwnedTheme(id, userId) {
  const theme = await prisma.theme.findFirst({ where: { id, userId } })
  if (!theme) {
    throw new ApiError(404, 'NOT_FOUND', 'Theme was not found.')
  }
  return theme
}

async function requireOwnedProject(id, userId) {
  const project = await prisma.project.findFirst({ where: { id, userId } })
  if (!project) {
    throw new ApiError(404, 'NOT_FOUND', 'Project was not found.')
  }
  return project
}

function requireStatus(value) {
  if (!pageStatuses.has(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'status must be DRAFT or PUBLISHED.')
  }
  return value
}

router.get('/', asyncHandler(async (req, res) => {
  const where = { userId: req.user.id }
  if (req.query.themeId !== undefined) {
    where.themeId = requireText(req.query.themeId, 'themeId')
  }
  if (req.query.status !== undefined) {
    where.status = requireStatus(req.query.status)
  }

  const pages = await prisma.page.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      theme: { select: { id: true, name: true, slug: true } },
      project: { select: { id: true, name: true, slug: true } },
    },
  })
  res.json({ data: pages })
}))

router.post('/', asyncHandler(async (req, res) => {
  const themeId = requireText(req.body?.themeId, 'themeId')
  await requireOwnedTheme(themeId, req.user.id)
  const projectId = req.body?.projectId === undefined || req.body.projectId === null
    ? null
    : requireText(req.body.projectId, 'projectId')
  if (projectId) await requireOwnedProject(projectId, req.user.id)
  const name = requireText(req.body?.name, 'name')
  const slug = requireText(req.body?.slug, 'slug')
  const existingPage = await prisma.page.findFirst({
    where: { userId: req.user.id, projectId, slug },
    select: { id: true },
  })
  if (existingPage) {
    throw new ApiError(409, 'CONFLICT', `A page with the slug "${slug}" already exists in this ${projectId ? 'project' : 'account'}.`)
  }

  const page = await prisma.page.create({
    data: {
      name,
      slug,
      themeId,
      projectId,
      contentJson: requireJson(req.body?.contentJson, 'contentJson'),
      userId: req.user.id,
      ...(req.body?.status === undefined ? {} : { status: requireStatus(req.body.status) }),
    },
  })
  res.status(201).json({ data: page })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const page = await prisma.page.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: {
      theme: { select: { id: true, name: true, slug: true } },
      project: { select: { id: true, name: true, slug: true } },
    },
  })
  if (!page) {
    throw new ApiError(404, 'NOT_FOUND', 'Page was not found.')
  }
  res.json({ data: page })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const data = {}
  if (Object.hasOwn(req.body ?? {}, 'name')) data.name = requireText(req.body.name, 'name')
  if (Object.hasOwn(req.body ?? {}, 'slug')) data.slug = requireText(req.body.slug, 'slug')
  if (Object.hasOwn(req.body ?? {}, 'themeId')) {
    data.themeId = requireText(req.body.themeId, 'themeId')
    await requireOwnedTheme(data.themeId, req.user.id)
  }
  if (Object.hasOwn(req.body ?? {}, 'projectId')) {
    data.projectId = req.body.projectId === null
      ? null
      : requireText(req.body.projectId, 'projectId')
    if (data.projectId) await requireOwnedProject(data.projectId, req.user.id)
  }
  if (Object.hasOwn(req.body ?? {}, 'contentJson')) {
    data.contentJson = requireJson(req.body.contentJson, 'contentJson')
    data.version = { increment: 1 }
  }
  if (Object.hasOwn(req.body ?? {}, 'status')) data.status = requireStatus(req.body.status)
  if (Object.keys(data).length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide at least one field to update.')
  }

  const currentPage = await requireOwnedPage(req.params.id, req.user.id)
  if (Object.hasOwn(data, 'slug') || Object.hasOwn(data, 'projectId')) {
    const targetSlug = data.slug || currentPage.slug
    const targetProjectId = Object.hasOwn(data, 'projectId') ? data.projectId : currentPage.projectId
    const duplicatePage = await prisma.page.findFirst({
      where: {
        userId: req.user.id,
        projectId: targetProjectId,
        slug: targetSlug,
        id: { not: req.params.id },
      },
      select: { id: true },
    })
    if (duplicatePage) {
      throw new ApiError(409, 'CONFLICT', `A page with the slug "${targetSlug}" already exists in this ${targetProjectId ? 'project' : 'account'}.`)
    }
  }
  const page = await prisma.page.update({
    where: { id: req.params.id },
    data,
  })
  res.json({ data: page })
}))

router.post('/:id/publish', asyncHandler(async (req, res) => {
  await requireOwnedPage(req.params.id, req.user.id)
  const page = await prisma.page.update({
    where: { id: req.params.id },
    data: { status: 'PUBLISHED' },
  })
  res.json({ data: page })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await requireOwnedPage(req.params.id, req.user.id)
  await prisma.page.delete({ where: { id: req.params.id } })
  res.status(204).end()
}))

export default router
