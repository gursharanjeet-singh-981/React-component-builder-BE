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
const authErrors = { 401: responseRef('Unauthorized') }
const bearerSecurity = [{ bearerAuth: [] }]
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
    description: 'API for builder themes and pages. To try protected endpoints in Swagger: (1) call POST /api/auth/register or POST /api/auth/login with email and password; (2) copy data.accessToken from the response; (3) select Authorize and enter the token (without the word Bearer); (4) call the locked theme and page endpoints. User accounts share the same themes and pages. Health and documentation endpoints remain public. Resource responses use a data envelope; errors use an error envelope. JSON request bodies are limited to 10 MB. Create a theme first, then use its ID to create pages.',
  },
  servers: [{ url: '/', description: 'Current host (local development or deployed API)' }],
  tags: [
    { name: 'Health', description: 'Backend and database availability.' },
    { name: 'Authentication', description: 'Email/password registration, login, and current-user lookup.' },
    { name: 'Themes', description: 'Theme configuration and page counts.' },
    { name: 'Pages', description: 'Page content, versions, and publishing.' },
  ],
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Authentication'],
        operationId: 'register',
        summary: 'Register an account and get an access token',
        description: 'Use Try it out with an email and any non-empty password. The response includes data.accessToken. Copy that value and select Authorize to call protected endpoints.',
        requestBody: requestBody('Credentials'),
        responses: {
          201: dataResponse('Account created and bearer access token issued.', 'AuthSession'),
          400: responseRef('BadRequest'),
          409: responseRef('Conflict'),
          ...readErrors,
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Authentication'],
        operationId: 'login',
        summary: 'Log in and get an access token',
        description: 'Use Try it out with the registered email and password. Copy data.accessToken from the response, then select Authorize and paste the token without the word Bearer.',
        requestBody: requestBody('Credentials'),
        responses: {
          200: dataResponse('Bearer access token issued.', 'AuthSession'),
          400: responseRef('BadRequest'),
          401: errorResponse('Email or password is incorrect.', 'INVALID_CREDENTIALS', 'Email or password is incorrect.'),
          ...readErrors,
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Authentication'],
        operationId: 'getCurrentUser',
        summary: 'Get the authenticated user',
        security: bearerSecurity,
        responses: {
          200: dataResponse('Current user.', 'CurrentUser'),
          ...authErrors,
          ...readErrors,
        },
      },
    },
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
        security: bearerSecurity,
        description: 'Returns all themes, newest first, including each theme\'s page count. No pagination.',
        responses: { 200: dataResponse('Themes with page counts.', 'ThemeWithCount', true), ...authErrors, ...readErrors },
      },
      post: {
        tags: ['Themes'],
        operationId: 'createTheme',
        summary: 'Create a theme',
        security: bearerSecurity,
        requestBody: requestBody('CreateTheme'),
        responses: { 201: dataResponse('Theme created.', 'Theme'), ...authErrors, ...writeErrors },
      },
    },
    '/api/themes/{id}': {
      parameters: [idParameter],
      get: {
        tags: ['Themes'],
        operationId: 'getTheme',
        summary: 'Get a theme',
        security: bearerSecurity,
        responses: { 200: dataResponse('Theme with page count.', 'ThemeWithCount'), ...authErrors, ...notFound, ...readErrors },
      },
      patch: {
        tags: ['Themes'],
        operationId: 'updateTheme',
        summary: 'Update a theme',
        security: bearerSecurity,
        description: 'Provide at least one supported field. configJson replaces the entire stored document.',
        requestBody: requestBody('UpdateTheme'),
        responses: { 200: dataResponse('Theme updated.', 'Theme'), ...authErrors, ...writeErrors, ...notFound },
      },
      delete: {
        tags: ['Themes'],
        operationId: 'deleteTheme',
        summary: 'Delete a theme',
        security: bearerSecurity,
        description: 'Delete the theme\'s pages first. A theme referenced by pages cannot be deleted.',
        responses: { 204: { description: 'Theme deleted. No response body.' }, 409: responseRef('Conflict'), ...authErrors, ...notFound, ...readErrors },
      },
    },
    '/api/pages': {
      get: {
        tags: ['Pages'],
        operationId: 'listPages',
        summary: 'List pages',
        security: bearerSecurity,
        description: 'Returns all matching pages, newest first, with a theme summary. Filters may be combined. No pagination.',
        parameters: [
          { name: 'themeId', in: 'query', description: 'Filter by theme ID.', schema: text },
          { name: 'status', in: 'query', description: 'Filter by page status.', schema: schemaRef('PageStatus') },
        ],
        responses: { 200: dataResponse('Pages with theme summaries.', 'PageWithTheme', true), 400: responseRef('BadRequest'), ...authErrors, ...readErrors },
      },
      post: {
        tags: ['Pages'],
        operationId: 'createPage',
        summary: 'Create a page',
        security: bearerSecurity,
        description: 'The theme must exist. New pages start at version 1; status defaults to DRAFT.',
        requestBody: requestBody('CreatePage'),
        responses: { 201: dataResponse('Page created.', 'Page'), ...authErrors, ...writeErrors },
      },
    },
    '/api/pages/{id}': {
      parameters: [idParameter],
      get: {
        tags: ['Pages'],
        operationId: 'getPage',
        summary: 'Get a page',
        security: bearerSecurity,
        responses: { 200: dataResponse('Page with theme summary.', 'PageWithTheme'), ...authErrors, ...notFound, ...readErrors },
      },
      patch: {
        tags: ['Pages'],
        operationId: 'updatePage',
        summary: 'Update a page',
        security: bearerSecurity,
        description: 'Provide at least one supported field. Updating contentJson replaces the document and increments version by 1, even if content is unchanged. Other updates do not increment version.',
        requestBody: requestBody('UpdatePage'),
        responses: { 200: dataResponse('Page updated.', 'Page'), ...authErrors, ...writeErrors, ...notFound },
      },
      delete: {
        tags: ['Pages'],
        operationId: 'deletePage',
        summary: 'Delete a page',
        security: bearerSecurity,
        responses: { 204: { description: 'Page deleted. No response body.' }, ...authErrors, ...notFound, ...readErrors },
      },
    },
    '/api/pages/{id}/publish': {
      parameters: [idParameter],
      post: {
        tags: ['Pages'],
        operationId: 'publishPage',
        summary: 'Publish a page',
        security: bearerSecurity,
        description: 'Sets status to PUBLISHED without changing version. No request body is required; already-published pages remain published.',
        responses: { 200: dataResponse('Published page.', 'Page'), ...authErrors, ...notFound, ...readErrors },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'email', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          email: { type: 'string', format: 'email' },
          createdAt: { type: 'string', format: 'date-time', readOnly: true },
        },
      },
      Credentials: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 1 },
        },
        example: { email: 'user@example.com', password: 'strong-password' },
      },
      AuthSession: {
        type: 'object',
        required: ['user', 'accessToken', 'tokenType', 'expiresIn'],
        properties: {
          user: schemaRef('User'),
          accessToken: { type: 'string' },
          tokenType: { type: 'string', enum: ['Bearer'] },
          expiresIn: { type: 'integer', example: 3600 },
        },
      },
      CurrentUser: {
        type: 'object',
        required: ['user'],
        properties: { user: schemaRef('User') },
      },
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
              code: { type: 'string', enum: ['VALIDATION_ERROR', 'INVALID_JSON', 'NOT_FOUND', 'CONFLICT', 'PAYLOAD_TOO_LARGE', 'UNAUTHORIZED', 'INVALID_CREDENTIALS', 'INTERNAL_ERROR'] },
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
      Unauthorized: errorResponse('A valid bearer access token is required or the token has expired.', 'UNAUTHORIZED', 'A valid bearer access token is required.'),
      NotFound: errorResponse('The resource was not found.', 'NOT_FOUND', 'The requested record was not found.'),
      Conflict: errorResponse('A unique value already exists, a referenced theme is missing, or a theme is still referenced by pages.', 'CONFLICT', 'A record with the provided unique value already exists.'),
      PayloadTooLarge: errorResponse('Request body exceeds the 10 MB limit.', 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 10 MB limit.'),
      InternalError: errorResponse('An unexpected server error occurred.', 'INTERNAL_ERROR', 'An unexpected server error occurred.'),
    },
  },
}

export default openapi