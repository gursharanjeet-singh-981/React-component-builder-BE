import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { prisma } from './database.js'
import { asyncHandler, handleApiError } from './api-utils.js'
import openapi from './openapi.js'
import pagesRouter from './routes/pages.js'
import themesRouter from './routes/themes.js'
import authRouter from './routes/auth.js'
import { requireAuthentication } from './auth-middleware.js'

const app = express()

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
)

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin.replace(/\/+$/, '')))
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}))

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

app.use('/api/auth', authRouter)
app.use('/api/themes', requireAuthentication, themesRouter)
app.use('/api/pages', requireAuthentication, pagesRouter)

app.use('/api', (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'API endpoint was not found.' },
  })
})

app.use(handleApiError)

export default app