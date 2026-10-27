import { PrismaClient } from '@prisma/client'
import { getDatabaseUrl } from './database-config.js'

const databaseUrl = getDatabaseUrl()

export const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl },
  },
})
