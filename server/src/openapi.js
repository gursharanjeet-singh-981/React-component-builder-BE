const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` })
const responseRef = (name) => ({ $ref: `#/components/responses/${name}` })

const jsonResponse = (description, schema) => ({
  description,
  content: { 'application/json': { schema } },
})

const dataResponse = (description, schema, list = false) => jsonResponse(description, {
  type: 'object',
  required: ['data'],
  properties: { data: list ? { type: 'array', items: schemaRef(schema) } : schemaRef(schema) },
})

const requestBody = (schema) => ({
  required: true,
  content: { 'application/json': { schema: schemaRef(schema) } },
})

const readErrors = { 500: responseRef('InternalError') }
const writeErrors = {
  400: responseRef('BadRequest'),
  409: responseRef('Conflict'),
  413: responseRef('PayloadTooLarge'),
  ...readErrors,
}
const notFound = { 404: responseRef('NotFound') }
const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Resource ID returned by the API.',
  schema: { type: 'string' },
}
const text = { type: 'string', minLength: 1, pattern: '\\S', description: 'Non-blank text. Leading and trailing whitespace is trimmed.' }
const timestamps = {
  createdAt: { type: 'string', format: 'date-time', readOnly: true },
  updatedAt: { type: 'string', format: 'date-time', readOnly: true },
}
const themeFields = {
  name: { ...text, example: 'Brand' },
  slug: { ...text, example: 'brand', description: 'Non-blank, unique theme slug. Leading and trailing whitespace is trimmed.' },
  configJson: schemaRef('JsonDocument'),
}
const pageFields = {
  name: { ...text, example: 'Home' },
  slug: { ...text, example: 'home', description: 'Non-blank, unique page slug. Leading and trailing whitespace is trimmed.' },
  themeId: { ...text, description: 'ID of an existing theme.' },
  contentJson: schemaRef('JsonDocument'),
  status: schemaRef('PageStatus'),
}

const updateSchema = (properties) => ({
  type: 'object',
  properties,
  anyOf: Object.keys(properties).map((name) => ({ required: [name] })),
})

const errorResponse = (description, code, message) => ({
  description,
  content: {
    'application/json': {
      schema: schemaRef('ApiError'),
      example: { error: { code, message } },
    },
  },
})

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Component Builder API',
    version: '1.0.0',
    description: 'API for builder themes and pages. No authentication is currently required. Resource responses use a data envelope; errors use an error envelope. JSON request bodies are limited to 10 MB. Create a theme first, then use its ID to create pages.',
  },
  servers: [{ url: '/', description: 'Current host (local development or deployed API)' }],
  tags: [
    { name: 'Health', description: 'Backend and database availability.' },
    { name: 'Themes', description: 'Theme configuration and page counts.' },
    { name: 'Pages', description: 'Page content, versions, and publishing.' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        operationId: 'getHealth',
        summary: 'Check database connectivity',
        responses: {
          200: jsonResponse('Backend and database are connected.', schemaRef('HealthOk')),
          503: jsonResponse('Database is unavailable.', schemaRef('HealthUnavailable')),
        },
      },
    },
    '/api/themes': {
      get: {
        tags: ['Themes'],
        operationId: 'listThemes',
        summary: 'List themes',
        description: 'Returns all themes, newest first, including each theme\'s page count. No pagination.',
        responses: { 200: dataResponse('Themes with page counts.', 'ThemeWithCount', true), ...readErrors },
      },
      post: {
        tags: ['Themes'],
        operationId: 'createTheme',
        summary: 'Create a theme',
        requestBody: requestBody('CreateTheme'),
        responses: { 201: dataResponse('Theme created.', 'Theme'), ...writeErrors },
      },
    },
    '/api/themes/{id}': {
      parameters: [idParameter],
      get: {
        tags: ['Themes'],
        operationId: 'getTheme',
        summary: 'Get a theme',
        responses: { 200: dataResponse('Theme with page count.', 'ThemeWithCount'), ...notFound, ...readErrors },
      },
      patch: {
        tags: ['Themes'],
        operationId: 'updateTheme',
        summary: 'Update a theme',
        description: 'Provide at least one supported field. configJson replaces the entire stored document.',
        requestBody: requestBody('UpdateTheme'),
        responses: { 200: dataResponse('Theme updated.', 'Theme'), ...writeErrors, ...notFound },
      },
      delete: {
        tags: ['Themes'],
        operationId: 'deleteTheme',
        summary: 'Delete a theme',
        description: 'Delete the theme\'s pages first. A theme referenced by pages cannot be deleted.',
        responses: { 204: { description: 'Theme deleted. No response body.' }, 409: responseRef('Conflict'), ...notFound, ...readErrors },
      },
    },
    '/api/pages': {
      get: {
        tags: ['Pages'],
        operationId: 'listPages',
        summary: 'List pages',
        description: 'Returns all matching pages, newest first, with a theme summary. Filters may be combined. No pagination.',
        parameters: [
          { name: 'themeId', in: 'query', description: 'Filter by theme ID.', schema: text },
          { name: 'status', in: 'query', description: 'Filter by page status.', schema: schemaRef('PageStatus') },
        ],
        responses: { 200: dataResponse('Pages with theme summaries.', 'PageWithTheme', true), 400: responseRef('BadRequest'), ...readErrors },
      },
      post: {
        tags: ['Pages'],
        operationId: 'createPage',
        summary: 'Create a page',
        description: 'The theme must exist. New pages start at version 1; status defaults to DRAFT.',
        requestBody: requestBody('CreatePage'),
        responses: { 201: dataResponse('Page created.', 'Page'), ...writeErrors },
      },
    },
    '/api/pages/{id}': {
      parameters: [idParameter],
      get: {
        tags: ['Pages'],
        operationId: 'getPage',
        summary: 'Get a page',
        responses: { 200: dataResponse('Page with theme summary.', 'PageWithTheme'), ...notFound, ...readErrors },
      },
      patch: {
        tags: ['Pages'],
        operationId: 'updatePage',
        summary: 'Update a page',
        description: 'Provide at least one supported field. Updating contentJson replaces the document and increments version by 1, even if content is unchanged. Other updates do not increment version.',
        requestBody: requestBody('UpdatePage'),
        responses: { 200: dataResponse('Page updated.', 'Page'), ...writeErrors, ...notFound },
      },
      delete: {
        tags: ['Pages'],
        operationId: 'deletePage',
        summary: 'Delete a page',
        responses: { 204: { description: 'Page deleted. No response body.' }, ...notFound, ...readErrors },
      },
    },
    '/api/pages/{id}/publish': {
      parameters: [idParameter],
      post: {
        tags: ['Pages'],
        operationId: 'publishPage',
        summary: 'Publish a page',
        description: 'Sets status to PUBLISHED without changing version. No request body is required; already-published pages remain published.',
        responses: { 200: dataResponse('Published page.', 'Page'), ...notFound, ...readErrors },
      },
    },
  },
  components: {
    schemas: {
      JsonDocument: {
        description: 'A JSON object or array with arbitrary nested JSON values. Scalars and null are not accepted at the top level.',
        oneOf: [{ type: 'object', additionalProperties: true }, { type: 'array', items: {} }],
        example: { sections: [] },
      },
      PageStatus: { type: 'string', enum: ['DRAFT', 'PUBLISHED'] },
      Theme: {
        type: 'object',
        required: ['id', 'name', 'slug', 'configJson', 'createdAt', 'updatedAt'],
        properties: { id: { type: 'string', format: 'uuid', readOnly: true }, ...themeFields, ...timestamps },
      },
      ThemeWithCount: {
        allOf: [schemaRef('Theme'), {
          type: 'object',
          required: ['_count'],
          properties: {
            _count: { type: 'object', required: ['pages'], properties: { pages: { type: 'integer', minimum: 0, example: 2 } } },
          },
        }],
      },
      ThemeSummary: {
        type: 'object',
        required: ['id', 'name', 'slug'],
        properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, slug: { type: 'string' } },
      },
      Page: {
        type: 'object',
        required: ['id', 'name', 'slug', 'themeId', 'contentJson', 'status', 'version', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          ...pageFields,
          version: { type: 'integer', minimum: 1, readOnly: true, example: 1 },
          ...timestamps,
        },
      },
      PageWithTheme: {
        allOf: [schemaRef('Page'), { type: 'object', required: ['theme'], properties: { theme: schemaRef('ThemeSummary') } }],
      },
      CreateTheme: {
        type: 'object',
        required: ['name', 'slug', 'configJson'],
        properties: themeFields,
        example: { name: 'Brand', slug: 'brand', configJson: { colors: { primary: '#0055aa' } } },
      },
      UpdateTheme: { ...updateSchema(themeFields), example: { name: 'Updated Brand' } },
      CreatePage: {
        type: 'object',
        required: ['name', 'slug', 'themeId', 'contentJson'],
        properties: { ...pageFields, status: { type: 'string', enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' } },
        example: { name: 'Home', slug: 'home', themeId: 'replace-with-created-theme-id', contentJson: { sections: [] }, status: 'DRAFT' },
      },
      UpdatePage: { ...updateSchema(pageFields), example: { contentJson: { sections: [] } } },
      ApiError: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', enum: ['VALIDATION_ERROR', 'INVALID_JSON', 'NOT_FOUND', 'CONFLICT', 'PAYLOAD_TOO_LARGE', 'INTERNAL_ERROR'] },
              message: { type: 'string' },
            },
          },
        },
      },
      HealthOk: {
        type: 'object',
        required: ['status', 'message', 'database', 'timestamp'],
        properties: {
          status: { type: 'string', enum: ['ok'] },
          message: { type: 'string', example: 'Backend is connected' },
          database: { type: 'string', enum: ['connected'] },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      HealthUnavailable: {
        type: 'object',
        required: ['status', 'database', 'timestamp'],
        properties: {
          status: { type: 'string', enum: ['error'] },
          database: { type: 'string', enum: ['unavailable'] },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
    responses: {
      BadRequest: errorResponse('Field validation failed (VALIDATION_ERROR) or the request body is malformed JSON (INVALID_JSON).', 'VALIDATION_ERROR', 'Provide at least one field to update.'),
      NotFound: errorResponse('The resource was not found.', 'NOT_FOUND', 'The requested record was not found.'),
      Conflict: errorResponse('Duplicate slug, missing referenced theme, or a theme still referenced by pages.', 'CONFLICT', 'A record with that slug already exists.'),
      PayloadTooLarge: errorResponse('Request body exceeds the 10 MB limit.', 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 10 MB limit.'),
      InternalError: errorResponse('An unexpected server error occurred.', 'INTERNAL_ERROR', 'An unexpected server error occurred.'),
    },
  },
}

export default openapi