import { Router } from 'express'
import { prisma } from '../database.js'
import { ApiError, asyncHandler, requireText } from '../api-utils.js'
import { requireAuthentication } from '../auth-middleware.js'
import {
  assertAuthConfiguration,
  createAccessToken,
  hashPassword,
  verifyPassword,
} from '../auth-service.js'

const router = Router()
const maxProfileImageBytes = 2 * 1024 * 1024

function requireEmail(value) {
  const email = requireText(value, 'email').toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'email must be a valid email address.')
  }
  return email
}

function requirePassword(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'password must be a non-empty string.')
  }
  return value
}

function userResponse(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profileImage: user.profileImage,
    createdAt: user.createdAt,
  }
}

router.post('/register', asyncHandler(async (req, res) => {
  const email = requireEmail(req.body?.email)
  const password = requirePassword(req.body?.password)
  assertAuthConfiguration()
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true, name: true, profileImage: true, createdAt: true },
  })
  const accessToken = await createAccessToken(user.id)

  res.status(201).json({
    data: { user: userResponse(user), accessToken, tokenType: 'Bearer', expiresIn: 3600 },
  })
}))

router.post('/login', asyncHandler(async (req, res) => {
  const email = requireEmail(req.body?.email)
  const password = requirePassword(req.body?.password)
  assertAuthConfiguration()
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
  }

  const accessToken = await createAccessToken(user.id)
  res.json({
    data: {
      user: userResponse(user),
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
    },
  })
}))

router.get('/me', requireAuthentication, (req, res) => {
  res.json({ data: { user: req.user } })
})

router.patch('/me', requireAuthentication, asyncHandler(async (req, res) => {
  const data = {}
  if (Object.hasOwn(req.body ?? {}, 'name')) {
    const name = requireText(req.body.name, 'name')
    if (name.length > 80) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'name must be 80 characters or fewer.')
    }
    data.name = name
  }
  if (Object.hasOwn(req.body ?? {}, 'profileImage')) {
    const profileImage = req.body.profileImage
    if (profileImage !== null) {
      const match = typeof profileImage === 'string'
        ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(profileImage)
        : null
      if (!match) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'profileImage must be a PNG, JPEG, or WebP data URL, or null.')
      }
      if (match[2].length > Math.ceil(maxProfileImageBytes / 3) * 4) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'profileImage must be no larger than 2 MB.')
      }

      const imageBytes = Buffer.from(match[2], 'base64')
      if (
        imageBytes.length === 0
        || imageBytes.length > maxProfileImageBytes
        || imageBytes.toString('base64') !== match[2]
      ) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'profileImage must be a valid image no larger than 2 MB.')
      }

      const isPng = match[1] === 'png'
        && imageBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      const isJpeg = match[1] === 'jpeg'
        && imageBytes[0] === 255 && imageBytes[1] === 216 && imageBytes[2] === 255
      const isWebp = match[1] === 'webp'
        && imageBytes.toString('ascii', 0, 4) === 'RIFF'
        && imageBytes.toString('ascii', 8, 12) === 'WEBP'
      if (!isPng && !isJpeg && !isWebp) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'profileImage contents do not match the declared image type.')
      }
    }
    data.profileImage = profileImage
  }
  if (Object.keys(data).length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide at least one profile field to update.')
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    select: { id: true, email: true, name: true, profileImage: true, createdAt: true },
  })
  res.json({ data: { user } })
}))

export default router
