import { Router } from 'express'
import { prisma } from '../database.js'
import { ApiError, asyncHandler, requireJson, requireText } from '../api-utils.js'

const router = Router()

router.get('/', asyncHandler(async (req, res) => {
  const themes = await prisma.theme.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { pages: true } } },
  })
  res.json({ data: themes })
}))

router.post('/', asyncHandler(async (req, res) => {
  const theme = await prisma.theme.create({
    data: {
      name: requireText(req.body?.name, 'name'),
      slug: requireText(req.body?.slug, 'slug'),
      configJson: requireJson(req.body?.configJson, 'configJson'),
    },
  })
  res.status(201).json({ data: theme })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const theme = await prisma.theme.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { pages: true } } },
  })
  if (!theme) {
    throw new ApiError(404, 'NOT_FOUND', 'Theme was not found.')
  }
  res.json({ data: theme })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const data = {}
  if (Object.hasOwn(req.body ?? {}, 'name')) data.name = requireText(req.body.name, 'name')
  if (Object.hasOwn(req.body ?? {}, 'slug')) data.slug = requireText(req.body.slug, 'slug')
  if (Object.hasOwn(req.body ?? {}, 'configJson')) {
    data.configJson = requireJson(req.body.configJson, 'configJson')
  }
  if (Object.keys(data).length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide at least one field to update.')
  }

  const theme = await prisma.theme.update({
    where: { id: req.params.id },
    data,
  })
  res.json({ data: theme })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await prisma.theme.delete({ where: { id: req.params.id } })
  res.status(204).end()
}))

export default router
