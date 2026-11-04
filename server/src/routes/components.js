import { Router } from 'express'
import { prisma } from '../database.js'
import {
  ApiError,
  asyncHandler,
  requireJson,
  requireText,
} from '../api-utils.js'

const router = Router()

async function requireOwnedComponent(id, userId) {
  const component = await prisma.component.findFirst({ where: { id, userId } })
  if (!component) {
    throw new ApiError(404, 'NOT_FOUND', 'Component was not found.')
  }
  return component
}

router.get('/', asyncHandler(async (req, res) => {
  const components = await prisma.component.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: 'desc' },
  })
  res.json({ data: components })
}))

router.post('/', asyncHandler(async (req, res) => {
  const component = await prisma.component.create({
    data: {
      name: requireText(req.body?.name, 'name'),
      contentJson: requireJson(req.body?.contentJson, 'contentJson'),
      userId: req.user.id,
    },
  })
  res.status(201).json({ data: component })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const component = await requireOwnedComponent(req.params.id, req.user.id)
  res.json({ data: component })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const data = {}
  if (Object.hasOwn(req.body ?? {}, 'name')) {
    data.name = requireText(req.body.name, 'name')
  }
  if (Object.hasOwn(req.body ?? {}, 'contentJson')) {
    data.contentJson = requireJson(req.body.contentJson, 'contentJson')
    data.version = { increment: 1 }
  }
  if (Object.keys(data).length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide at least one field to update.')
  }

  await requireOwnedComponent(req.params.id, req.user.id)
  const component = await prisma.component.update({
    where: { id: req.params.id },
    data,
  })
  res.json({ data: component })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await requireOwnedComponent(req.params.id, req.user.id)
  await prisma.component.delete({ where: { id: req.params.id } })
  res.status(204).end()
}))

export default router
