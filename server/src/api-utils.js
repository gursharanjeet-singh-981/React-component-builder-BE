export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

export function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a non-empty string.`)
  }

  return value.trim()
}

export function requireJson(value, field) {
  if (
    value === null
    || typeof value !== 'object'
    || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
  ) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a JSON object or array.`)
  }

  return value
}

export function handleApiError(error, req, res, next) {
  if (res.headersSent) {
    next(error)
    return
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message },
    })
    return
  }

  if (error?.code === 'P2002') {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'A record with the provided unique value already exists.' },
    })
    return
  }

  if (error?.code === 'P2003') {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'The record is referenced by another record.' },
    })
    return
  }

  if (error?.code === 'P2025') {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'The requested record was not found.' },
    })
    return
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' },
    })
    return
  }

  if (error?.status === 413) {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 10 MB limit.' },
    })
    return
  }

  console.error('API request failed:', error)
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' },
  })
}
