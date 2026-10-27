import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { prisma } from './database.js'
import { asyncHandler, handleApiError } from './api-utils.js'
import openapi from './openapi.js'
import pagesRouter from './routes/pages.js'
import themesRouter from './routes/themes.js'

const app = express()

app.use(cors())

app.use(express.json({ limit: '10mb' }))

app.get('/api/openapi.json', (req, res) => res.json(openapi))
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(null, {
  swaggerOptions: { url: '/api/openapi.json', validatorUrl: null },
  customSiteTitle: 'Component Builder API Documentation',
}))

app.get('/api/health', asyncHandler(async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      status: 'ok',
      message: 'Backend is connected',
      database: 'connected',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Database health check failed:', error)
    res.status(503).json({
      status: 'error',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    })
  }
}))

app.use('/api/themes', themesRouter)
app.use('/api/pages', pagesRouter)

app.use('/api', (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'API endpoint was not found.' },
  })
})

app.use(handleApiError)

export default app