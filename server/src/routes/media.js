import { Router } from 'express'
import { prisma } from '../database.js'
import { ApiError, asyncHandler, requireText } from '../api-utils.js'

const router = Router()
const maxAssetSize = 7 * 1024 * 1024
const supportedImageTypes = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const metadataSelect = {
  id: true,
  userId: true,
  name: true,
  folderPath: true,
  mimeType: true,
  size: true,
  createdAt: true,
}
const folderSelect = {
  id: true,
  userId: true,
  name: true,
  path: true,
  createdAt: true,
}

function normalizeFolderPath(value) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'folderPath must be a string.')
  }

  const segments = value.replace(/\\/g, '/').split('/').map((s) => s.trim()).filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..' || /[\u0000-\u001f]/.test(segment))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'folderPath contains an invalid folder name.')
  }
  return segments.join('/')
}

function requireFolderName(value) {
  const name = requireText(value, 'name')
  if (name.length > 100 || name === '.' || name === '..' || /[\\/:\u0000-\u001f]/.test(name)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'name must be a valid folder name.')
  }
  return name
}

function isValidImage(bytes, mimeType) {
  if (mimeType === 'image/png') {
    return bytes.length >= 8
      && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mimeType === 'image/gif') {
    return bytes.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  if (mimeType === 'image/avif') {
    return bytes.length >= 12
      && bytes.subarray(4, 8).toString('ascii') === 'ftyp'
      && bytes.subarray(8, 12).toString('ascii').startsWith('avi')
  }
  return false
}

async function ensureFolderHierarchy(folderPath, userId) {
  const normalized = normalizeFolderPath(folderPath)
  if (!normalized) return ''
  const segments = normalized.split('/')
  let currentPath = ''
  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment
    const existing = await prisma.mediaFolder.findFirst({
      where: { path: currentPath },
      select: { id: true },
    })
    if (!existing) {
      try {
        await prisma.mediaFolder.create({
          data: {
            userId,
            name: segment,
            path: currentPath,
          },
        })
      } catch {
        // Ignore race condition if created concurrently
      }
    }
  }
  return normalized
}

router.get('/', asyncHandler(async (req, res) => {
  const where = {}
  if (req.query.folderPath !== undefined) {
    where.folderPath = normalizeFolderPath(String(req.query.folderPath))
  }
  if (req.query.search !== undefined && String(req.query.search).trim()) {
    where.name = { contains: String(req.query.search).trim(), mode: 'insensitive' }
  }
  const assets = await prisma.mediaAsset.findMany({
    where,
    select: metadataSelect,
    orderBy: [{ folderPath: 'asc' }, { name: 'asc' }, { createdAt: 'desc' }],
  })
  res.json({ data: assets })
}))

router.get('/folders', asyncHandler(async (req, res) => {
  const [folders, assetFolders] = await Promise.all([
    prisma.mediaFolder.findMany({
      select: folderSelect,
      orderBy: { path: 'asc' },
    }),
    prisma.mediaAsset.findMany({
      select: { folderPath: true },
      distinct: ['folderPath'],
    }),
  ])

  const folderMap = new Map()
  for (const folder of folders) {
    if (!folderMap.has(folder.path)) {
      folderMap.set(folder.path, folder)
    }
  }

  for (const { folderPath } of assetFolders) {
    if (!folderPath) continue
    const segments = folderPath.split('/').filter(Boolean)
    let current = ''
    for (const seg of segments) {
      current = current ? `${current}/${seg}` : seg
      if (!folderMap.has(current)) {
        folderMap.set(current, {
          id: `virtual-${current}`,
          name: seg,
          path: current,
          createdAt: new Date(0).toISOString(),
        })
      }
    }
  }

  const dedupedFolders = [...folderMap.values()].sort((a, b) => a.path.localeCompare(b.path))
  res.json({ data: dedupedFolders })
}))

router.post('/folders', asyncHandler(async (req, res) => {
  const name = requireFolderName(req.body?.name)
  const parentPath = normalizeFolderPath(req.body?.parentPath ?? '')
  if (parentPath) {
    const parent = await prisma.mediaFolder.findFirst({
      where: { path: parentPath },
      select: { id: true },
    })
    if (!parent) {
      await ensureFolderHierarchy(parentPath, req.user.id)
    }
  }

  const path = parentPath ? `${parentPath}/${name}` : name
  const existing = await prisma.mediaFolder.findFirst({
    where: { path },
    select: { id: true },
  })
  if (existing) {
    throw new ApiError(409, 'CONFLICT', 'A folder with this name already exists here.')
  }

  const folder = await prisma.mediaFolder.create({
    data: { userId: req.user.id, name, path },
    select: folderSelect,
  })
  res.status(201).json({ data: folder })
}))

router.patch('/folders', asyncHandler(async (req, res) => {
  const oldPath = normalizeFolderPath(requireText(req.body?.path, 'path'))
  const newName = requireFolderName(req.body?.name)

  const segments = oldPath.split('/')
  const parentPath = segments.slice(0, -1).join('/')
  const newPath = parentPath ? `${parentPath}/${newName}` : newName

  if (oldPath === newPath) {
    const folder = await prisma.mediaFolder.findFirst({
      where: { path: oldPath },
      select: folderSelect,
    })
    return res.json({ data: folder || { id: `virtual-${oldPath}`, name: newName, path: oldPath } })
  }

  const conflict = await prisma.mediaFolder.findFirst({
    where: { path: newPath },
    select: { id: true },
  })
  const assetConflict = await prisma.mediaAsset.findFirst({
    where: {
      OR: [
        { folderPath: newPath },
        { folderPath: { startsWith: `${newPath}/` } },
      ],
    },
    select: { id: true },
  })
  if (conflict || assetConflict) {
    throw new ApiError(409, 'CONFLICT', 'A folder with this name already exists here.')
  }

  const [existingFolders, existingAssets] = await Promise.all([
    prisma.mediaFolder.findMany({
      where: {
        OR: [
          { path: oldPath },
          { path: { startsWith: `${oldPath}/` } },
        ],
      },
    }),
    prisma.mediaAsset.findMany({
      where: {
        OR: [
          { folderPath: oldPath },
          { folderPath: { startsWith: `${oldPath}/` } },
        ],
      },
      select: { id: true, folderPath: true },
    }),
  ])

  if (existingFolders.length === 0 && existingAssets.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Folder was not found.')
  }

  await prisma.$transaction(async (tx) => {
    for (const folder of existingFolders) {
      const updatedPath = folder.path === oldPath
        ? newPath
        : `${newPath}${folder.path.slice(oldPath.length)}`
      const updatedName = folder.path === oldPath ? newName : folder.name
      await tx.mediaFolder.update({
        where: { id: folder.id },
        data: { name: updatedName, path: updatedPath },
      })
    }

    if (existingFolders.every((f) => f.path !== oldPath)) {
      await tx.mediaFolder.create({
        data: { userId: req.user.id, name: newName, path: newPath },
      })
    }

    for (const asset of existingAssets) {
      const updatedFolderPath = asset.folderPath === oldPath
        ? newPath
        : `${newPath}${asset.folderPath.slice(oldPath.length)}`
      await tx.mediaAsset.update({
        where: { id: asset.id },
        data: { folderPath: updatedFolderPath },
      })
    }
  })

  const updatedFolder = await prisma.mediaFolder.findFirst({
    where: { path: newPath },
    select: folderSelect,
  })
  res.json({ data: updatedFolder })
}))

router.delete('/folders', asyncHandler(async (req, res) => {
  const targetPath = normalizeFolderPath(requireText(req.body?.path ?? req.query?.path, 'path'))
  const deleteAssets = Boolean(req.body?.deleteAssets || req.query?.deleteAssets === 'true')

  const [matchingFolders, matchingAssets] = await Promise.all([
    prisma.mediaFolder.findMany({
      where: {
        OR: [
          { path: targetPath },
          { path: { startsWith: `${targetPath}/` } },
        ],
      },
      select: { id: true },
    }),
    prisma.mediaAsset.findMany({
      where: {
        OR: [
          { folderPath: targetPath },
          { folderPath: { startsWith: `${targetPath}/` } },
        ],
      },
      select: { id: true },
    }),
  ])

  if (matchingFolders.length === 0 && matchingAssets.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Folder was not found.')
  }

  await prisma.$transaction(async (tx) => {
    if (deleteAssets) {
      await tx.mediaAsset.deleteMany({
        where: {
          OR: [
            { folderPath: targetPath },
            { folderPath: { startsWith: `${targetPath}/` } },
          ],
        },
      })
    } else if (matchingAssets.length > 0) {
      await tx.mediaAsset.updateMany({
        where: {
          OR: [
            { folderPath: targetPath },
            { folderPath: { startsWith: `${targetPath}/` } },
          ],
        },
        data: { folderPath: '' },
      })
    }

    await tx.mediaFolder.deleteMany({
      where: {
        OR: [
          { path: targetPath },
          { path: { startsWith: `${targetPath}/` } },
        ],
      },
    })
  })

  res.status(204).end()
}))

router.post('/', asyncHandler(async (req, res) => {
  const name = requireText(req.body?.name, 'name')
  if (name.length > 255 || /[\\/:\u0000-\u001f]/.test(name) || name === '.' || name === '..') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'name must be a valid image filename.')
  }
  const folderPath = await ensureFolderHierarchy(req.body?.folderPath ?? '', req.user.id)
  const mimeType = requireText(req.body?.mimeType, 'mimeType').toLowerCase()
  if (!supportedImageTypes.has(mimeType)) {
    throw new ApiError(400, 'UNSUPPORTED_MEDIA_TYPE', 'Only PNG, JPEG, GIF, WebP, and AVIF images are supported.')
  }

  const encoded = req.body?.contentBase64
  if (typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'contentBase64 must contain valid Base64 image data.')
  }
  const content = Buffer.from(encoded, 'base64')
  if (content.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Image content cannot be empty.')
  }
  if (content.length > maxAssetSize) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Images must be 7 MB or smaller.')
  }
  if (!isValidImage(content, mimeType)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The image content does not match the selected image type.')
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      userId: req.user.id,
      name,
      folderPath,
      mimeType,
      size: content.length,
      content,
    },
    select: metadataSelect,
  })
  res.status(201).json({ data: asset })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.mediaAsset.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  })
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Media asset was not found.')
  }

  const data = {}
  if (Object.hasOwn(req.body ?? {}, 'name')) {
    const name = requireText(req.body.name, 'name')
    if (name.length > 255 || /[\\/:\u0000-\u001f]/.test(name) || name === '.' || name === '..') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'name must be a valid image filename.')
    }
    data.name = name
  }
  if (Object.hasOwn(req.body ?? {}, 'folderPath')) {
    data.folderPath = await ensureFolderHierarchy(req.body.folderPath ?? '', req.user.id)
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide at least one field to update.')
  }

  const updated = await prisma.mediaAsset.update({
    where: { id: req.params.id },
    data,
    select: metadataSelect,
  })
  res.json({ data: updated })
}))

export const getMediaAssetContent = asyncHandler(async (req, res) => {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: req.params.id },
    select: { content: true, mimeType: true },
  })
  if (!asset) {
    throw new ApiError(404, 'NOT_FOUND', 'Media asset was not found.')
  }
  const content = Buffer.from(asset.content)
  res.set({
    'Content-Type': asset.mimeType,
    'Content-Length': content.length,
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  })
  res.send(content)
})

router.get('/:id/content', getMediaAssetContent)

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await prisma.mediaAsset.deleteMany({
    where: { id: req.params.id },
  })
  if (result.count === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Media asset was not found.')
  }
  res.status(204).end()
}))

export default router
