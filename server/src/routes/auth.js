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
  return { id: user.id, email: user.email, createdAt: user.createdAt }
}

router.post('/register', asyncHandler(async (req, res) => {
  const email = requireEmail(req.body?.email)
  const password = requirePassword(req.body?.password)
  assertAuthConfiguration()
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true, createdAt: true },
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

export default router
