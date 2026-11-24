import { Router } from 'express'
import { prisma } from '../database.js'
import { ApiError, asyncHandler, requireText } from '../api-utils.js'

const router = Router()
const projectSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

async function requireOwnedProject(id, userId) {
  const project = await prisma.project.findFirst({ where: { id, userId } })
  if (!project) {
    throw new ApiError(404, 'NOT_FOUND', 'Project was not found.')
  }
  return project
}

function requireProjectFields(body, fields = ['name', 'slug']) {
  const data = {}
  if (fields.includes('name') && Object.hasOwn(body ?? {}, 'name')) {
    data.name = requireText(body.name, 'name')
    if (data.name.length > 100) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'name must be 100 characters or fewer.')
    }
  }
  if (fields.includes('slug') && Object.hasOwn(body ?? {}, 'slug')) {
    data.slug = requireText(body.slug, 'slug').toLowerCase()
    if (data.slug.length > 63 || !projectSlugPattern.test(data.slug)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'slug must contain lowercase letters, numbers, and single hyphens, and start and end with a letter or number.')
    }
  }
  return data
}

router.get('/', asyncHandler(async (req, res) => {
  const projects = await prisma.project.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      deploymentJson: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { pages: true } },
    },
  })
  res.json({ data: projects })
}))

router.post('/', asyncHandler(async (req, res) => {
  const data = requireProjectFields(req.body)
  if (!data.name || !data.slug) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'name and slug are required.')
  }

  const existing = await prisma.project.findFirst({
    where: {
      userId: req.user.id,
      OR: [
        { name: { equals: data.name, mode: 'insensitive' } },
        { slug: { equals: data.slug, mode: 'insensitive' } },
      ],
    },
  })
  if (existing) {
    throw new ApiError(409, 'CONFLICT', 'A project with that name or slug already exists.')
  }

  const project = await prisma.project.create({
    data: { ...data, userId: req.user.id },
    select: {
      id: true,
      name: true,
      slug: true,
      deploymentJson: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { pages: true } },
    },
  })
  res.status(201).json({ data: project })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    select: {
      id: true,
      name: true,
      slug: true,
      deploymentJson: true,
      createdAt: true,
      updatedAt: true,
      pages: {
        orderBy: { createdAt: 'asc' },
        include: { theme: { select: { id: true, name: true, slug: true } } },
      },
    },
  })
  if (!project) {
    throw new ApiError(404, 'NOT_FOUND', 'Project was not found.')
  }
  res.json({ data: project })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const data = requireProjectFields(req.body)
  if (Object.keys(data).length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a project name or slug to update.')
  }

  const currentProject = await requireOwnedProject(req.params.id, req.user.id)
  if (data.slug && data.slug !== currentProject.slug && currentProject.vercelProjectId) {
    throw new ApiError(409, 'CONFLICT', 'A deployed project slug cannot be changed.')
  }
  if (data.name || data.slug) {
    const existing = await prisma.project.findFirst({
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
      throw new ApiError(409, 'CONFLICT', 'A project with that name or slug already exists.')
    }
  }

  const project = await prisma.project.update({
    where: { id: req.params.id },
    data,
    select: {
      id: true,
      name: true,
      slug: true,
      deploymentJson: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { pages: true } },
    },
  })
  res.json({ data: project })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await requireOwnedProject(req.params.id, req.user.id)
  const pageCount = await prisma.page.count({
    where: { projectId: req.params.id, userId: req.user.id },
  })
  if (pageCount > 0) {
    throw new ApiError(409, 'CONFLICT', 'Move or delete this project’s pages before deleting the project.')
  }
  await prisma.project.delete({ where: { id: req.params.id } })
  res.status(204).end()
}))

export default router
