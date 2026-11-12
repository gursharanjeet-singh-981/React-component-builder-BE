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
    include: { theme: { select: { id: true, name: true, slug: true } } },
  })
  res.json({ data: pages })
}))

router.get('/homepage', asyncHandler(async (req, res) => {
  const settings = await prisma.appSettings.findUnique({
    where: { id: 1 },
    include: {
      homepagePage: {
        select: { id: true, name: true, status: true },
      },
    },
  })
  const page = settings?.homepagePage || null
  res.json({ data: page })
}))

router.patch('/homepage', asyncHandler(async (req, res) => {
  const pageId = req.body?.pageId === null
    ? null
    : requireText(req.body?.pageId, 'pageId')
  let page = null

  if (pageId) {
    page = await prisma.page.findFirst({
      where: { id: pageId, userId: req.user.id },
      include: { theme: true },
    })
    if (!page) {
      throw new ApiError(404, 'NOT_FOUND', 'Page was not found.')
    }
    if (page.status !== 'PUBLISHED') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Publish the page before setting it as the public homepage.')
    }
  }

  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { homepagePageId: pageId },
    create: { id: 1, homepagePageId: pageId },
  })
  res.json({ data: page })
}))

router.post('/', asyncHandler(async (req, res) => {
  const themeId = requireText(req.body?.themeId, 'themeId')
  await requireOwnedTheme(themeId, req.user.id)

  const page = await prisma.page.create({
    data: {
      name: requireText(req.body?.name, 'name'),
      slug: requireText(req.body?.slug, 'slug'),
      themeId,
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
    include: { theme: { select: { id: true, name: true, slug: true } } },
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
  if (Object.hasOwn(req.body ?? {}, 'contentJson')) {
    data.contentJson = requireJson(req.body.contentJson, 'contentJson')
    data.version = { increment: 1 }
  }
  if (Object.hasOwn(req.body ?? {}, 'status')) {
    data.status = requireStatus(req.body.status)
    if (data.status === 'DRAFT') {
      const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })
      if (settings?.homepagePageId === req.params.id) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Clear the public homepage selection before unpublishing this page.')
      }
    }
  }
  if (Object.keys(data).length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide at least one field to update.')
  }

  await requireOwnedPage(req.params.id, req.user.id)
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
