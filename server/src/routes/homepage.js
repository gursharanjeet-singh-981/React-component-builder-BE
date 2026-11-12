import { Router } from 'express'
import { prisma } from '../database.js'
import { asyncHandler } from '../api-utils.js'

const router = Router()

router.get('/', asyncHandler(async (_req, res) => {
  const settings = await prisma.appSettings.findUnique({
    where: { id: 1 },
    include: {
      homepagePage: {
        select: {
          id: true,
          name: true,
          slug: true,
          themeId: true,
          status: true,
          contentJson: true,
          version: true,
          updatedAt: true,
          theme: {
            select: { id: true, name: true, slug: true, configJson: true },
          },
        },
      },
    },
  })
  const page = settings?.homepagePage?.status === 'PUBLISHED'
    ? settings.homepagePage
    : null
  res.json({ data: page })
}))

export default router
