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
  name: true,
  folderPath: true,
  mimeType: true,
  size: true,
  createdAt: true,
}
const folderSelect = {
  id: true,
  name: true,
  path: true,
  createdAt: true,
}

function normalizeFolderPath(value) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'folderPath must be a string.')
  }

  const segments = value.replace(/\\/g, '/').split('/').filter(Boolean)
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

router.get('/', asyncHandler(async (req, res) => {
  const assets = await prisma.mediaAsset.findMany({
    where: { userId: req.user.id },
    select: metadataSelect,
    orderBy: [{ folderPath: 'asc' }, { name: 'asc' }],
  })
  res.json({ data: assets })
}))

router.get('/folders', asyncHandler(async (req, res) => {
  const folders = await prisma.mediaFolder.findMany({
    where: { userId: req.user.id },
    select: folderSelect,
    orderBy: { path: 'asc' },
  })
  res.json({ data: folders })
}))

router.post('/folders', asyncHandler(async (req, res) => {
  const name = requireFolderName(req.body?.name)
  const parentPath = normalizeFolderPath(req.body?.parentPath ?? '')
  if (parentPath) {
    const parent = await prisma.mediaFolder.findUnique({
      where: { userId_path: { userId: req.user.id, path: parentPath } },
      select: { id: true },
    })
    if (!parent) {
      throw new ApiError(404, 'NOT_FOUND', 'Parent folder was not found.')
    }
  }

  const path = parentPath ? `${parentPath}/${name}` : name
  const existing = await prisma.mediaFolder.findUnique({
    where: { userId_path: { userId: req.user.id, path } },
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

router.post('/', asyncHandler(async (req, res) => {
  const name = requireText(req.body?.name, 'name')
  if (name.length > 255 || /[\\/:\u0000-\u001f]/.test(name) || name === '.' || name === '..') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'name must be a valid image filename.')
  }
  const folderPath = normalizeFolderPath(req.body?.folderPath ?? '')
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

router.get('/:id/content', asyncHandler(async (req, res) => {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    select: { content: true, mimeType: true },
  })
  if (!asset) {
    throw new ApiError(404, 'NOT_FOUND', 'Media asset was not found.')
  }
  const content = Buffer.from(asset.content)
  res.set({
    'Content-Type': asset.mimeType,
    'Content-Length': content.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.send(content)
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await prisma.mediaAsset.deleteMany({
    where: { id: req.params.id, userId: req.user.id },
  })
  if (result.count === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Media asset was not found.')
  }
  res.status(204).end()
}))

export default router
