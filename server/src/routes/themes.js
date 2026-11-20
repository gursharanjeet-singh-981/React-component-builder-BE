import { Router } from 'express'
import { prisma } from '../database.js'
import { ApiError, asyncHandler, requireJson, requireText } from '../api-utils.js'

const router = Router()

async function requireOwnedTheme(id, userId) {
  const theme = await prisma.theme.findFirst({ where: { id, userId } })
  if (!theme) {
    throw new ApiError(404, 'NOT_FOUND', 'Theme was not found.')
  }
  return theme
}

router.get('/', asyncHandler(async (req, res) => {
  const themes = await prisma.theme.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { pages: { where: { userId: req.user.id } } },
      },
    },
  })
  res.json({ data: themes })
}))

router.post('/', asyncHandler(async (req, res) => {
  const name = requireText(req.body?.name, 'name').trim()
  const slug = requireText(req.body?.slug, 'slug').trim()
  const configJson = requireJson(req.body?.configJson, 'configJson')

  const existing = await prisma.theme.findFirst({
    where: {
      userId: req.user.id,
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { slug: { equals: slug, mode: 'insensitive' } },
      ],
    },
  })
  if (existing) {
    if (existing.name.toLowerCase() === name.toLowerCase()) {
      throw new ApiError(409, 'CONFLICT', `A theme named "${name}" already exists. Please choose a different name.`)
    }
    throw new ApiError(409, 'CONFLICT', `A theme with slug "${slug}" already exists. Please choose a different slug.`)
  }

  const theme = await prisma.theme.create({
    data: {
      name,
      slug,
      configJson,
      userId: req.user.id,
    },
  })
  res.status(201).json({ data: theme })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const theme = await prisma.theme.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: {
      _count: {
        select: { pages: { where: { userId: req.user.id } } },
      },
    },
  })
  if (!theme) {
    throw new ApiError(404, 'NOT_FOUND', 'Theme was not found.')
  }
  res.json({ data: theme })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const data = {}
  if (Object.hasOwn(req.body ?? {}, 'name')) data.name = requireText(req.body.name, 'name').trim()
  if (Object.hasOwn(req.body ?? {}, 'slug')) data.slug = requireText(req.body.slug, 'slug').trim()
  if (Object.hasOwn(req.body ?? {}, 'configJson')) {
    data.configJson = requireJson(req.body.configJson, 'configJson')
  }
  if (Object.keys(data).length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide at least one field to update.')
  }

  await requireOwnedTheme(req.params.id, req.user.id)

  if (data.name || data.slug) {
    const existing = await prisma.theme.findFirst({
      where: {
        userId: req.user.id,
        id: { not: req.params.id },
        OR: [
          ...(data.name ? [{ name: { equals: data.name, mode: 'insensitive' } }] : []),
          ...(data.slug ? [{ slug: { equals: data.slug, mode: 'insensitive' } }] : []),
        ],
      },
    })
    if (existing) {
      if (data.name && existing.name.toLowerCase() === data.name.toLowerCase()) {
        throw new ApiError(409, 'CONFLICT', `A theme named "${data.name}" already exists. Please choose a different name.`)
      }
      throw new ApiError(409, 'CONFLICT', `A theme with slug "${data.slug}" already exists. Please choose a different slug.`)
    }
  }

  const theme = await prisma.theme.update({
    where: { id: req.params.id },
    data,
  })
  res.json({ data: theme })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await requireOwnedTheme(req.params.id, req.user.id)
  await prisma.theme.delete({ where: { id: req.params.id } })
  res.status(204).end()
}))

export default router
