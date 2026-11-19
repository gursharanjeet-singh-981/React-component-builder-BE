import process from 'node:process'
import app from './app.js'
import { cleanupDatabaseConfig } from './database-config.js'
import { prisma } from './database.js'
import { assertAuthConfiguration } from './auth-service.js'

const port = Number(process.env.PORT) || 3001

try {
  assertAuthConfiguration()
  const server = app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`)
  })

  prisma.$connect()
    .then(() => {
      console.log('Database connected')
    })
    .catch((error) => {
      console.error('Initial database connection warning:', error.message)
    })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(async () => {
        try {
          await prisma.$disconnect()
        } catch (error) {
          console.error('Database disconnect failed:', error)
          process.exitCode = 1
        } finally {
          cleanupDatabaseConfig()
        }
      })
    })
  }
} catch (error) {
  console.error('Backend startup failed:', error)
  await prisma.$disconnect()
  cleanupDatabaseConfig()
  process.exitCode = 1
}