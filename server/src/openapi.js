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
  slug: { ...text, example: 'brand', description: 'Non-blank theme slug, unique per user. Leading and trailing whitespace is trimmed.' },
  configJson: schemaRef('JsonDocument'),
}
const projectFields = {
  name: { ...text, maxLength: 100, example: 'Marketing Website' },
  slug: { ...text, maxLength: 63, pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', example: 'marketing-website' },
}
const pageFields = {
  name: { ...text, example: 'Home' },
  slug: { ...text, example: 'home', description: 'Non-blank page slug, unique within a project. Standalone page slugs remain unique per user. Leading and trailing whitespace is trimmed.' },
  themeId: { ...text, description: 'ID of a theme owned by the authenticated user.' },
  projectId: { type: 'string', nullable: true, description: 'Optional ID of a project owned by the authenticated user.' },
  contentJson: schemaRef('JsonDocument'),
  status: schemaRef('PageStatus'),
}
const componentFields = {
  name: { ...text, example: 'Hero Banner', description: 'Non-blank component name. Leading and trailing whitespace is trimmed.' },
  contentJson: schemaRef('JsonDocument'),
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
    description: 'API for builder projects, pages, themes, reusable components, and media assets. To try protected endpoints in Swagger: (1) call POST /api/auth/register or POST /api/auth/login with email and password; (2) copy data.accessToken from the response; (3) select Authorize and enter the token (without the word Bearer); (4) call the protected endpoints. Projects, themes, pages, components, and media assets are scoped to their owner; pages can only reference themes and projects owned by the same user. Health and documentation endpoints remain public. Resource responses use a data envelope; errors use an error envelope. JSON request bodies are limited to 10 MB. Create a project, then add themed pages to it.',
  },
  servers: [{ url: '/', description: 'Current host (local development or deployed API)' }],
  tags: [
    { name: 'Health', description: 'Backend and database availability.' },
    { name: 'Authentication', description: 'Email/password registration, login, and profile access and updates.' },
    { name: 'Themes', description: 'Theme configuration and page counts.' },
    { name: 'Projects', description: 'Project organization and grouped page management.' },
    { name: 'Pages', description: 'Page content, versions, and publishing.' },
    { name: 'Components', description: 'Reusable builder components.' },
    { name: 'Media', description: 'User-owned image assets with folder paths.' },
    { name: 'Integrations', description: 'Deploy generated projects directly to Vercel.' },
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
    '/api/auth/forgot-password': {
      post: {
        tags: ['Authentication'],
        operationId: 'requestPasswordReset',
        summary: 'Send a password reset link',
        description: 'Always returns the same accepted response for valid email addresses to avoid disclosing whether an account exists. Reset links expire after 30 minutes and requests are limited to one email per account per minute. Configure SMTP and APP_BASE_URL on the server.',
        requestBody: requestBody('ForgotPasswordRequest'),
        responses: {
          202: dataResponse('Request accepted; if the address belongs to an account, a reset link will be sent.', 'PasswordResetMessage'),
          400: responseRef('BadRequest'),
          503: {
            description: 'SMTP is not configured or could not deliver the message.',
            content: {
              'application/json': {
                schema: schemaRef('ApiError'),
                examples: {
                  notConfigured: {
                    summary: 'SMTP is not configured',
                    value: { error: { code: 'EMAIL_NOT_CONFIGURED', message: 'Password reset email is not configured on the server.' } },
                  },
                  deliveryFailed: {
                    summary: 'Email delivery failed',
                    value: { error: { code: 'EMAIL_DELIVERY_FAILED', message: 'Unable to send a password reset email right now. Please try again later.' } },
                  },
                },
              },
            },
          },
          ...readErrors,
        },
      },
    },
    '/api/auth/reset-password': {
      post: {
        tags: ['Authentication'],
        operationId: 'resetPassword',
        summary: 'Set a new password with a reset token',
        description: 'Consumes the emailed, single-use token and updates the password. Tokens expire after 30 minutes.',
        requestBody: requestBody('ResetPasswordRequest'),
        responses: {
          200: dataResponse('Password updated.', 'PasswordResetMessage'),
          400: responseRef('BadRequest'),
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
      patch: {
        tags: ['Authentication'],
        operationId: 'updateCurrentUser',
        summary: 'Update the authenticated user profile',
        security: bearerSecurity,
        description: 'Updates the current user name and/or profile image. Names must contain non-whitespace text and be at most 80 characters. Profile images must be PNG, JPEG, or WebP data URLs no larger than 2 MB; set profileImage to null to remove it.',
        requestBody: requestBody('UpdateProfile'),
        responses: {
          200: dataResponse('Profile updated.', 'CurrentUser'),
          ...authErrors,
          400: responseRef('BadRequest'),
          413: responseRef('PayloadTooLarge'),
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
        description: 'Returns the authenticated user\'s themes, newest first, including each theme\'s page count. Theme slugs are unique per user. No pagination.',
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
        description: 'Updates a theme owned by the authenticated user. Provide at least one supported field. configJson replaces the entire stored document.',
        requestBody: requestBody('UpdateTheme'),
        responses: { 200: dataResponse('Theme updated.', 'Theme'), ...authErrors, ...writeErrors, ...notFound },
      },
      delete: {
        tags: ['Themes'],
        operationId: 'deleteTheme',
        summary: 'Delete a theme',
        security: bearerSecurity,
        description: 'Delete the owned theme\'s pages first. A theme referenced by pages cannot be deleted. Other users\' themes are not accessible.',
        responses: { 204: { description: 'Theme deleted. No response body.' }, 409: responseRef('Conflict'), ...authErrors, ...notFound, ...readErrors },
      },
    },
    '/api/projects': {
      get: {
        tags: ['Projects'],
        operationId: 'listProjects',
        summary: 'List projects',
        security: bearerSecurity,
        responses: { 200: dataResponse('Projects with page counts.', 'ProjectWithCount', true), ...authErrors, ...readErrors },
      },
      post: {
        tags: ['Projects'],
        operationId: 'createProject',
        summary: 'Create a project',
        security: bearerSecurity,
        requestBody: requestBody('CreateProject'),
        responses: { 201: dataResponse('Project created.', 'ProjectWithCount'), ...authErrors, ...writeErrors },
      },
    },
    '/api/projects/{id}': {
      parameters: [idParameter],
      get: {
        tags: ['Projects'],
        operationId: 'getProject',
        summary: 'Get a project and its pages',
        security: bearerSecurity,
        responses: { 200: dataResponse('Project with its pages and deployment details.', 'ProjectWithPages'), ...authErrors, ...notFound, ...readErrors },
      },
      patch: {
        tags: ['Projects'],
        operationId: 'updateProject',
        summary: 'Update a project',
        security: bearerSecurity,
        requestBody: requestBody('UpdateProject'),
        responses: { 200: dataResponse('Project updated.', 'ProjectWithCount'), ...authErrors, ...writeErrors, ...notFound },
      },
      delete: {
        tags: ['Projects'],
        operationId: 'deleteProject',
        summary: 'Delete an empty project',
        security: bearerSecurity,
        description: 'Projects containing pages cannot be deleted. Move or delete all pages first.',
        responses: { 204: { description: 'Project deleted.' }, ...authErrors, ...notFound, 409: responseRef('Conflict'), ...readErrors },
      },
    },
    '/api/pages': {
      get: {
        tags: ['Pages'],
        operationId: 'listPages',
        summary: 'List pages',
        security: bearerSecurity,
        description: 'Returns the authenticated user\'s matching pages, newest first, with a theme summary. Filters may be combined. No pagination.',
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
        description: 'The theme must belong to the authenticated user. New pages are owned by that user, start at version 1, and default to DRAFT.',
        requestBody: requestBody('CreatePage'),
        responses: { 201: dataResponse('Page created.', 'Page'), ...authErrors, ...writeErrors, ...notFound },
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
        description: 'Updates a page owned by the authenticated user. Any replacement theme must also belong to that user. Provide at least one supported field. Updating contentJson replaces the document and increments version by 1, even if content is unchanged. Other updates do not increment version.',
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
        description: 'Sets the owned page status to PUBLISHED without changing version. No request body is required; already-published pages remain published.',
        responses: { 200: dataResponse('Published page.', 'Page'), ...authErrors, ...notFound, ...readErrors },
      },
    },
    '/api/components': {
      get: {
        tags: ['Components'],
        operationId: 'listComponents',
        summary: 'List saved components',
        security: bearerSecurity,
        description: 'Returns the authenticated user\'s saved components, most recently updated first.',
        responses: { 200: dataResponse('Saved components.', 'Component', true), ...authErrors, ...readErrors },
      },
      post: {
        tags: ['Components'],
        operationId: 'createComponent',
        summary: 'Save a component',
        security: bearerSecurity,
        description: 'Creates a reusable component owned by the authenticated user. New components start at version 1.',
        requestBody: requestBody('CreateComponent'),
        responses: { 201: dataResponse('Component saved.', 'Component'), ...authErrors, ...writeErrors },
      },
    },
    '/api/components/{id}': {
      parameters: [idParameter],
      get: {
        tags: ['Components'],
        operationId: 'getComponent',
        summary: 'Retrieve a saved component',
        security: bearerSecurity,
        responses: { 200: dataResponse('Saved component.', 'Component'), ...authErrors, ...notFound, ...readErrors },
      },
      patch: {
        tags: ['Components'],
        operationId: 'updateComponent',
        summary: 'Update a saved component',
        security: bearerSecurity,
        description: 'Updates a component owned by the authenticated user. Provide at least one supported field. Updating contentJson increments version; renaming alone does not.',
        requestBody: requestBody('UpdateComponent'),
        responses: { 200: dataResponse('Component updated.', 'Component'), ...authErrors, ...writeErrors, ...notFound },
      },
      delete: {
        tags: ['Components'],
        operationId: 'deleteComponent',
        summary: 'Delete a saved component',
        security: bearerSecurity,
        responses: { 204: { description: 'Component deleted. No response body.' }, ...authErrors, ...notFound, ...readErrors },
      },
    },
    '/api/media': {
      get: {
        tags: ['Media'],
        operationId: 'listMediaAssets',
        summary: 'List media assets',
        security: bearerSecurity,
        description: 'Returns shared media image metadata across all authenticated users, including the preserved relative folder path.',
        parameters: [
          { name: 'folderPath', in: 'query', description: 'Optional folder path filter.', schema: { type: 'string' } },
          { name: 'search', in: 'query', description: 'Optional filename search filter.', schema: { type: 'string' } },
        ],
        responses: { 200: dataResponse('Media assets.', 'MediaAsset', true), ...authErrors, ...readErrors },
      },
      post: {
        tags: ['Media'],
        operationId: 'uploadMediaAsset',
        summary: 'Upload an image',
        security: bearerSecurity,
        description: 'Stores a PNG, JPEG, GIF, WebP, or AVIF image up to 7 MB. Send the image bytes as Base64 in contentBase64 and the relative directory in folderPath.',
        requestBody: requestBody('CreateMediaAsset'),
        responses: { 201: dataResponse('Media asset uploaded.', 'MediaAsset'), ...authErrors, ...writeErrors },
      },
    },
    '/api/integrations/connections': {
      get: {
        tags: ['Integrations'],
        operationId: 'listIntegrationConnections',
        summary: 'List connected provider accounts',
        security: bearerSecurity,
        responses: { 200: dataResponse('Connected provider accounts.', 'IntegrationConnections'), ...authErrors, ...readErrors },
      },
    },
    '/api/integrations/publishing-results/{documentId}': {
      parameters: [{ ...idParameter, name: 'documentId', description: 'Stable Builder document ID.' }],
      get: {
        tags: ['Integrations'],
        operationId: 'getBuilderPublishingResults',
        summary: 'Get the saved Vercel deployment for a Builder document',
        security: bearerSecurity,
        responses: {
          200: jsonResponse('Saved publishing results, or null when none exist.', {
            type: 'object',
            required: ['data'],
            properties: { data: { oneOf: [schemaRef('BuilderPublishingResultRecord'), { type: 'null' }] } },
          }),
          ...authErrors,
          ...readErrors,
        },
      },
      put: {
        tags: ['Integrations'],
        operationId: 'saveBuilderPublishingResults',
        summary: 'Save the Vercel deployment for a Builder document',
        security: bearerSecurity,
        requestBody: requestBody('BuilderPublishingResultRecord'),
        responses: {
          200: dataResponse('Publishing results saved.', 'BuilderPublishingResultRecord'),
          ...authErrors,
          400: responseRef('BadRequest'),
          ...readErrors,
        },
      },
    },
    '/api/integrations/credentials/{provider}': {
      parameters: [{ name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['vercel'] } }],
      put: {
        tags: ['Integrations'],
        operationId: 'saveIntegrationCredential',
        summary: 'Validate and securely save a provider token',
        security: bearerSecurity,
        requestBody: requestBody('SaveIntegrationCredential'),
        responses: {
          200: dataResponse('Provider credential saved; only the connected account name is returned.', 'IntegrationAccount'),
          ...authErrors,
          400: responseRef('BadRequest'),
          502: responseRef('IntegrationError'),
          ...readErrors,
        },
      },
    },
    '/api/integrations/{provider}': {
      parameters: [{ name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['vercel'] } }],
      delete: {
        tags: ['Integrations'],
        operationId: 'disconnectIntegration',
        summary: 'Disconnect a provider account',
        security: bearerSecurity,
        responses: { 204: { description: 'Provider disconnected.' }, ...authErrors, ...notFound, ...readErrors },
      },
    },
    '/api/integrations/vercel/deploy': {
      post: {
        tags: ['Integrations'],
        operationId: 'deployGeneratedProjectToVercel',
        summary: 'Deploy the generated project directly to Vercel',
        security: bearerSecurity,
        description: 'Requires a connected Vercel account. Project files are uploaded directly to Vercel.',
        requestBody: requestBody('DeployToVercel'),
        responses: {
          202: dataResponse('Project created and deployment queued.', 'VercelDeployment'),
          ...authErrors,
          400: responseRef('BadRequest'),
          502: responseRef('IntegrationError'),
          ...readErrors,
        },
      },
    },
    '/api/integrations/vercel/deploy-project': {
      post: {
        tags: ['Integrations'],
        operationId: 'deployProjectToVercel',
        summary: 'Deploy every page in a project to Vercel',
        security: bearerSecurity,
        description: 'Requires a connected Vercel account. All current pages must be included. The Vercel project and latest deployment are saved on the owned project.',
        requestBody: requestBody('DeployProjectToVercel'),
        responses: {
          202: dataResponse('Project deployment queued.', 'VercelDeployment'),
          ...authErrors,
          400: responseRef('BadRequest'),
          404: responseRef('NotFound'),
          413: responseRef('PayloadTooLarge'),
          502: responseRef('IntegrationError'),
          ...readErrors,
        },
      },
    },
    '/api/media/folders': {
      get: {
        tags: ['Media'],
        operationId: 'listMediaFolders',
        summary: 'List media folders',
        security: bearerSecurity,
        description: 'Returns shared media folders across all authenticated users, including empty folders.',
        responses: { 200: dataResponse('Media folders.', 'MediaFolder', true), ...authErrors, ...readErrors },
      },
      post: {
        tags: ['Media'],
        operationId: 'createMediaFolder',
        summary: 'Create a media folder',
        security: bearerSecurity,
        description: 'Creates a folder under the optional parent path.',
        requestBody: requestBody('CreateMediaFolder'),
        responses: { 201: dataResponse('Media folder created.', 'MediaFolder'), ...authErrors, ...writeErrors, ...notFound },
      },
      patch: {
        tags: ['Media'],
        operationId: 'renameMediaFolder',
        summary: 'Rename a media folder',
        security: bearerSecurity,
        description: 'Renames a media folder and updates all nested folders and assets.',
        requestBody: requestBody('RenameMediaFolder'),
        responses: { 200: dataResponse('Media folder renamed.', 'MediaFolder'), ...authErrors, ...writeErrors, ...notFound },
      },
      delete: {
        tags: ['Media'],
        operationId: 'deleteMediaFolder',
        summary: 'Delete a media folder',
        security: bearerSecurity,
        description: 'Deletes a media folder and moves or deletes its assets.',
        requestBody: requestBody('DeleteMediaFolder'),
        responses: { 204: { description: 'Media folder deleted. No response body.' }, ...authErrors, ...notFound, ...readErrors },
      },
    },
    '/api/media/{id}/content': {
      parameters: [idParameter],
      get: {
        tags: ['Media'],
        operationId: 'getMediaAssetContent',
        summary: 'Retrieve image content',
        responses: {
          200: {
            description: 'Image content.',
            content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
          },
          ...notFound,
          ...readErrors,
        },
      },
    },
    '/api/media/{id}': {
      parameters: [idParameter],
      patch: {
        tags: ['Media'],
        operationId: 'updateMediaAsset',
        summary: 'Update a media asset (rename or move folder)',
        security: bearerSecurity,
        requestBody: requestBody('UpdateMediaAsset'),
        responses: { 200: dataResponse('Media asset updated.', 'MediaAsset'), ...authErrors, ...writeErrors, ...notFound },
      },
      delete: {
        tags: ['Media'],
        operationId: 'deleteMediaAsset',
        summary: 'Delete a media asset',
        security: bearerSecurity,
        responses: { 204: { description: 'Media asset deleted. No response body.' }, ...authErrors, ...notFound, ...readErrors },
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
        required: ['id', 'email', 'name', 'profileImage', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          email: { type: 'string', format: 'email' },
          name: { type: 'string', maxLength: 80 },
          profileImage: { type: 'string', format: 'uri', nullable: true, description: 'PNG, JPEG, or WebP data URL; maximum decoded size 2 MB.' },
          createdAt: { type: 'string', format: 'date-time', readOnly: true },
        },
      },
      UpdateProfile: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
          profileImage: { type: 'string', format: 'uri', nullable: true, description: 'Set to null to remove the current image.' },
        },
        anyOf: [{ required: ['name'] }, { required: ['profileImage'] }],
        example: { name: 'Alex Morgan', profileImage: 'data:image/png;base64,...' },
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
      ForgotPasswordRequest: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email', maxLength: 254 } },
        example: { email: 'user@example.com' },
      },
      ResetPasswordRequest: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string', minLength: 64, maxLength: 64 },
          password: { type: 'string', minLength: 8, maxLength: 256, writeOnly: true },
        },
        example: { token: 'replace-with-the-token-from-the-email', password: 'a-new-strong-password' },
      },
      PasswordResetMessage: {
        type: 'object',
        required: ['message'],
        properties: { message: { type: 'string' } },
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
      ProjectSummary: {
        type: 'object',
        required: ['id', 'name', 'slug'],
        properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, slug: { type: 'string' } },
      },
      Project: {
        type: 'object',
        required: ['id', 'name', 'slug', 'deploymentJson', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          ...projectFields,
          deploymentJson: { type: 'object', nullable: true, additionalProperties: true },
          ...timestamps,
        },
      },
      ProjectWithCount: {
        allOf: [schemaRef('Project'), {
          type: 'object',
          required: ['_count'],
          properties: {
            _count: { type: 'object', required: ['pages'], properties: { pages: { type: 'integer', minimum: 0 } } },
          },
        }],
      },
      ProjectWithPages: {
        allOf: [schemaRef('Project'), {
          type: 'object',
          required: ['pages'],
          properties: { pages: { type: 'array', items: schemaRef('PageWithTheme') } },
        }],
      },
      Page: {
        type: 'object',
        required: ['id', 'name', 'slug', 'themeId', 'projectId', 'contentJson', 'status', 'version', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          ...pageFields,
          version: { type: 'integer', minimum: 1, readOnly: true, example: 1 },
          ...timestamps,
        },
      },
      PageWithTheme: {
        allOf: [schemaRef('Page'), {
          type: 'object',
          required: ['theme', 'project'],
          properties: {
            theme: schemaRef('ThemeSummary'),
            project: { oneOf: [schemaRef('ProjectSummary'), { type: 'null' }] },
          },
        }],
      },
      Component: {
        type: 'object',
        required: ['id', 'name', 'contentJson', 'version', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          ...componentFields,
          version: { type: 'integer', minimum: 1, readOnly: true, example: 1 },
          ...timestamps,
        },
      },
      MediaAsset: {
        type: 'object',
        required: ['id', 'name', 'folderPath', 'mimeType', 'size', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          name: { type: 'string', maxLength: 255 },
          folderPath: { type: 'string', description: 'Relative folder path, using forward slashes; empty for unfiled images.' },
          mimeType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'] },
          size: { type: 'integer', minimum: 1, maximum: 7340032 },
          createdAt: { type: 'string', format: 'date-time', readOnly: true },
        },
      },
      MediaFolder: {
        type: 'object',
        required: ['id', 'name', 'path', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          name: { type: 'string', maxLength: 100 },
          path: { type: 'string', description: 'Folder path relative to the media library root.' },
          createdAt: { type: 'string', format: 'date-time', readOnly: true },
        },
      },
      CreateMediaFolder: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          parentPath: { type: 'string', description: 'Optional path of the parent folder.' },
        },
        example: { name: 'Product photos', parentPath: 'Brand' },
      },
      RenameMediaFolder: {
        type: 'object',
        required: ['path', 'name'],
        properties: {
          path: { type: 'string', minLength: 1, description: 'Existing folder path.' },
          name: { type: 'string', minLength: 1, maxLength: 100, description: 'New folder name.' },
        },
        example: { path: 'Brand/OldName', name: 'NewName' },
      },
      DeleteMediaFolder: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', minLength: 1, description: 'Folder path to delete.' },
          deleteAssets: { type: 'boolean', description: 'Whether to delete assets inside the folder (default false moves them to root).' },
        },
        example: { path: 'Brand/OldName', deleteAssets: false },
      },
      UpdateMediaAsset: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          folderPath: { type: 'string' },
        },
        anyOf: [{ required: ['name'] }, { required: ['folderPath'] }],
        example: { name: 'hero-banner.png', folderPath: 'Home Page' },
      },
      CreateMediaAsset: {
        type: 'object',
        required: ['name', 'mimeType', 'contentBase64'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          folderPath: { type: 'string', description: 'Optional relative folder path preserved from the uploaded directory.' },
          mimeType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'] },
          contentBase64: { type: 'string', format: 'byte', description: 'Base64-encoded image bytes; decoded size must be at most 7 MB.' },
        },
        example: { name: 'hero.png', folderPath: 'site/images', mimeType: 'image/png', contentBase64: 'iVBORw0KGgo...' },
      },
      CreateTheme: {
        type: 'object',
        required: ['name', 'slug', 'configJson'],
        properties: themeFields,
        example: { name: 'Brand', slug: 'brand', configJson: { colors: { primary: '#0055aa' } } },
      },
      UpdateTheme: { ...updateSchema(themeFields), example: { name: 'Updated Brand' } },
      CreateProject: {
        type: 'object',
        required: ['name', 'slug'],
        properties: projectFields,
        example: { name: 'Marketing Website', slug: 'marketing-website' },
      },
      UpdateProject: { ...updateSchema(projectFields), example: { name: 'Updated Website' } },
      CreatePage: {
        type: 'object',
        required: ['name', 'slug', 'themeId', 'contentJson'],
        properties: { ...pageFields, status: { type: 'string', enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' } },
        example: { name: 'Home', slug: 'home', themeId: 'replace-with-created-theme-id', projectId: 'optional-project-id', contentJson: { sections: [] }, status: 'DRAFT' },
      },
      UpdatePage: { ...updateSchema(pageFields), example: { contentJson: { sections: [] } } },
      CreateComponent: {
        type: 'object',
        required: ['name', 'contentJson'],
        properties: componentFields,
        example: { name: 'Hero Banner', contentJson: { rows: [] } },
      },
      UpdateComponent: { ...updateSchema(componentFields), example: { contentJson: { rows: [] } } },
      IntegrationConnections: {
        type: 'object',
        required: ['vercel'],
        properties: {
          vercel: { oneOf: [schemaRef('IntegrationAccount'), { type: 'null' }] },
        },
      },
      IntegrationAccount: {
        type: 'object',
        required: ['provider', 'accountName'],
        properties: {
          provider: { type: 'string', enum: ['vercel'] },
          accountName: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      BuilderPublishingResultRecord: {
        type: 'object',
        required: ['deployment'],
        properties: {
          deployment: schemaRef('VercelDeployment'),
        },
      },
      SaveIntegrationCredential: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string', minLength: 1, writeOnly: true } },
      },
      DeployToVercel: {
        type: 'object',
        required: ['name', 'pageName', 'jsx'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          pageName: { type: 'string', minLength: 1 },
          jsx: { type: 'string', minLength: 1, maxLength: 1000000 },
        },
        DeployProjectToVercel: {
          type: 'object',
          required: ['projectId', 'pages'],
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            pages: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: {
                type: 'object',
                required: ['pageId', 'jsx'],
                properties: {
                  pageId: { type: 'string', format: 'uuid' },
                  jsx: { type: 'string', minLength: 1, maxLength: 1000000 },
                },
              },
            },
          },
        },
      },
      VercelDeployment: {
        type: 'object',
        required: ['projectId', 'projectUrl', 'deploymentId', 'deploymentState'],
        properties: {
          projectId: { type: 'string' },
          projectUrl: { type: 'string', format: 'uri' },
          deploymentId: { type: 'string' },
          deploymentUrl: { type: 'string', format: 'uri', nullable: true },
          deploymentState: { type: 'string' },
        },
      },
      ApiError: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', enum: ['VALIDATION_ERROR', 'INVALID_JSON', 'NOT_FOUND', 'CONFLICT', 'PAYLOAD_TOO_LARGE', 'UNAUTHORIZED', 'INVALID_CREDENTIALS', 'INVALID_RESET_TOKEN', 'EMAIL_NOT_CONFIGURED', 'EMAIL_DELIVERY_FAILED', 'INTEGRATION_ERROR', 'INTEGRATION_NOT_CONFIGURED', 'INTEGRATION_NOT_CONNECTED', 'INTEGRATION_TOKEN_EXPIRED', 'INTEGRATION_CALLBACK_ERROR', 'INTEGRATION_CREDENTIAL_ERROR', 'INTERNAL_ERROR'] },
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
      IntegrationError: errorResponse('Vercel rejected the integration request.', 'INTEGRATION_ERROR', 'Integration request failed.'),
      InternalError: errorResponse('An unexpected server error occurred.', 'INTERNAL_ERROR', 'An unexpected server error occurred.'),
    },
  },
}

export default openapi