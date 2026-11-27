import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { prisma } from '../database.js'
import { ApiError, asyncHandler, requireText } from '../api-utils.js'
import { requireAuthentication } from '../auth-middleware.js'
import {
  assertPasswordResetEmailConfiguration,
  sendPasswordResetEmail,
} from '../password-reset-mailer.js'
import {
  assertAuthConfiguration,
  createAccessToken,
  hashPassword,
  verifyPassword,
} from '../auth-service.js'

const router = Router()
const maxProfileImageBytes = 2 * 1024 * 1024
const resetTokenLifetimeMs = 30 * 60 * 1000
const resetEmailCooldownMs = 60 * 1000
const resetRequestMessage = 'If an account exists for that email, a password reset link will be sent.'

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

function hashResetToken(token) {
  return createHash('sha256').update(token).digest('hex')
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

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const email = requireEmail(req.body?.email)
  assertPasswordResetEmailConfiguration()
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })

  if (user) {
    const now = new Date()
    const existingToken = await prisma.passwordResetToken.findUnique({
      where: { userId: user.id },
      select: { createdAt: true },
    })

    if (!existingToken || now.getTime() - existingToken.createdAt.getTime() >= resetEmailCooldownMs) {
      const token = randomBytes(32).toString('hex')
      const tokenHash = hashResetToken(token)
      const resetToken = await prisma.passwordResetToken.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(now.getTime() + resetTokenLifetimeMs),
        },
        update: {
          tokenHash,
          expiresAt: new Date(now.getTime() + resetTokenLifetimeMs),
          createdAt: now,
        },
      })

      try {
        await sendPasswordResetEmail(email, token)
      } catch (error) {
        console.error('Password reset email delivery failed:', error)
        try {
          await prisma.passwordResetToken.deleteMany({
            where: { id: resetToken.id, tokenHash },
          })
        } catch (cleanupError) {
          console.error('Failed to remove an undelivered password reset token:', cleanupError)
        }
        throw new ApiError(
          503,
          'EMAIL_DELIVERY_FAILED',
          'Unable to send a password reset email right now. Please try again later.',
        )
      }
    }
  }

  res.status(202).json({ data: { message: resetRequestMessage } })
}))

router.post('/reset-password', asyncHandler(async (req, res) => {
  const token = requireText(req.body?.token, 'token')
  const password = requirePassword(req.body?.password)
  if (!/^[\da-f]{64}$/i.test(token)) {
    throw new ApiError(400, 'INVALID_RESET_TOKEN', 'The password reset link is invalid or expired.')
  }
  if (password.length < 8 || password.length > 256) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'password must be between 8 and 256 characters.')
  }

  const tokenHash = hashResetToken(token)
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
  if (!resetToken || resetToken.expiresAt <= new Date()) {
    throw new ApiError(400, 'INVALID_RESET_TOKEN', 'The password reset link is invalid or expired.')
  }

  const passwordHash = await hashPassword(password)
  const now = new Date()
  await prisma.$transaction(async (transaction) => {
    const deleted = await transaction.passwordResetToken.deleteMany({
      where: { id: resetToken.id, expiresAt: { gt: now } },
    })
    if (deleted.count !== 1) {
      throw new ApiError(400, 'INVALID_RESET_TOKEN', 'The password reset link is invalid or expired.')
    }
    await transaction.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    })
  })

  res.json({ data: { message: 'Password updated successfully.' } })
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
