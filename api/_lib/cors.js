import process from 'node:process'

const developmentOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function getAllowedOrigins() {
  const configuredOrigins = process.env.CORS_ORIGINS

  if (!configuredOrigins) {
    return developmentOrigins
  }

  return new Set(configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean))
}

export function applyCors(req, res) {
  const origin = req.headers.origin
  const isAllowedOrigin = origin && getAllowedOrigins().has(origin)

  res.setHeader('Vary', 'Origin')

  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '600')
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = origin && !isAllowedOrigin ? 403 : 204
    res.end()
    return false
  }

  return true
}