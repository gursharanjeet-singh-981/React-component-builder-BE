import { PrismaClient } from '@prisma/client'
import { getDatabaseUrl } from './database-config.js'

const databaseUrl = getDatabaseUrl()

const globalForPrisma = globalThis

export const prisma =
  globalForPrisma.__componentBuilderPrisma ||
  new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  })

globalForPrisma.__componentBuilderPrisma = prisma
