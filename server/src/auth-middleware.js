import { prisma } from './database.js'
import { ApiError, asyncHandler } from './api-utils.js'
import { verifyAccessToken } from './auth-service.js'

export const requireAuthentication = asyncHandler(async (req, res, next) => {
  const authorization = req.get('authorization') ?? ''
  const match = /^Bearer ([^\s]+)$/i.exec(authorization)
  if (!match) {
    throw new ApiError(401, 'UNAUTHORIZED', 'A valid bearer access token is required.')
  }

  const userId = await verifyAccessToken(match[1])
  if (!userId) {
    throw new ApiError(401, 'UNAUTHORIZED', 'The access token is invalid or expired.')
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true },
  })
  if (!user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'The access token is invalid or expired.')
  }

  req.user = user
  next()
})
