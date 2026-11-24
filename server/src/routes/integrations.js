import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { ApiError, asyncHandler, requireText } from '../api-utils.js'
import { prisma } from '../database.js'
import {
  createGeneratedMultiPageProjectFiles,
  createGeneratedProjectFiles,
} from '../generated-project.js'
import { requireAuthentication } from '../auth-middleware.js'

const router = Router()
const providers = new Set(['vercel'])
const vercelApi = 'https://api.vercel.com'

function getEncryptionKey() {
  const encodedKey = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY
  if (!encodedKey) {
    throw new ApiError(503, 'INTEGRATION_NOT_CONFIGURED', 'INTEGRATION_TOKEN_ENCRYPTION_KEY is not configured.')
  }

  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32 || key.toString('base64') !== encodedKey) {
    throw new ApiError(503, 'INTEGRATION_NOT_CONFIGURED', 'INTEGRATION_TOKEN_ENCRYPTION_KEY must be a Base64-encoded 32-byte key.')
  }
  return key
}

function encryptTokens(tokens) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(tokens), 'utf8'),
    cipher.final(),
  ])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

function decryptTokens(value) {
  const [version, encodedIv, encodedTag, encodedData] = value.split('.')
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedData) {
    throw new ApiError(500, 'INTEGRATION_CREDENTIAL_ERROR', 'The saved provider connection cannot be read.')
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(encodedIv, 'base64url'))
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedData, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
    return JSON.parse(plaintext)
  } catch {
    throw new ApiError(500, 'INTEGRATION_CREDENTIAL_ERROR', 'The saved provider connection cannot be decrypted. Check INTEGRATION_TOKEN_ENCRYPTION_KEY.')
  }
}

async function requestProviderJson(url, token, provider, options = {}) {
  let response
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError(502, 'INTEGRATION_ERROR', `${provider} could not be reached.`)
  }

  let result
  try {
    result = await response.json()
  } catch {
    throw new ApiError(502, 'INTEGRATION_ERROR', `${provider} returned an invalid response.`)
  }
  if (!response.ok) {
    const message = result.error?.message || result.message
    const error = new ApiError(
      response.status === 401 || response.status === 403 ? 400 : 502,
      'INTEGRATION_ERROR',
      message || `${provider} rejected the request with status ${response.status}.`,
    )
    error.providerStatus = response.status
    throw error
  }
  return result
}

async function saveConnection({ userId, provider, providerAccountId, accountName, tokens }) {
  await prisma.integrationConnection.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId,
      provider,
      providerAccountId: String(providerAccountId),
      accountName,
      encryptedAccessToken: encryptTokens(tokens),
    },
    update: {
      providerAccountId: String(providerAccountId),
      accountName,
      encryptedAccessToken: encryptTokens(tokens),
    },
  })
}

async function requireConnection(userId, provider) {
  const connection = await prisma.integrationConnection.findUnique({
    where: { userId_provider: { userId, provider } },
  })
  if (!connection) {
    throw new ApiError(400, 'INTEGRATION_NOT_CONNECTED', `Connect ${provider} before continuing.`)
  }

  const tokens = decryptTokens(connection.encryptedAccessToken)
  return { connection, token: tokens.accessToken }
}

function requireHttpsUrl(value, field, nullable = false) {
  if (nullable && value === null) return null
  const url = requireText(value, field)
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a valid HTTPS URL.`)
  }
  if (parsed.protocol !== 'https:') {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a valid HTTPS URL.`)
  }
  return url
}

function validatePublishingResult(value) {
  const deployment = value.deployment
  if (!deployment || typeof deployment !== 'object') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'deployment must be a Vercel deployment result.')
  }

  return {
    deployment: {
      projectId: requireText(deployment.projectId, 'deployment.projectId'),
      projectUrl: requireHttpsUrl(deployment.projectUrl, 'deployment.projectUrl'),
      deploymentId: requireText(deployment.deploymentId, 'deployment.deploymentId'),
      deploymentUrl: requireHttpsUrl(deployment.deploymentUrl, 'deployment.deploymentUrl', true),
      deploymentState: requireText(deployment.deploymentState, 'deployment.deploymentState'),
    },
  }
}

router.get('/publishing-results/:documentId', requireAuthentication, asyncHandler(async (req, res) => {
  const documentId = requireText(req.params.documentId, 'documentId')
  if (documentId.length > 200) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'documentId must be 200 characters or fewer.')
  }
  const result = await prisma.builderPublishingResult.findUnique({
    where: { userId_documentId: { userId: req.user.id, documentId } },
    select: { resultJson: true },
  })
  res.json({ data: result?.resultJson || null })
}))

router.put('/publishing-results/:documentId', requireAuthentication, asyncHandler(async (req, res) => {
  const documentId = requireText(req.params.documentId, 'documentId')
  if (documentId.length > 200) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'documentId must be 200 characters or fewer.')
  }
  const resultJson = validatePublishingResult(req.body)
  const result = await prisma.builderPublishingResult.upsert({
    where: { userId_documentId: { userId: req.user.id, documentId } },
    create: { userId: req.user.id, documentId, resultJson },
    update: { resultJson },
    select: { resultJson: true },
  })
  res.json({ data: result.resultJson })
}))

router.get('/connections', requireAuthentication, asyncHandler(async (req, res) => {
  const connections = await prisma.integrationConnection.findMany({
    where: { userId: req.user.id, provider: { in: [...providers] } },
    select: { provider: true, accountName: true, createdAt: true },
  })
  res.json({
    data: Object.fromEntries([...providers].map((provider) => [
      provider,
      connections.find((connection) => connection.provider === provider) || null,
    ])),
  })
}))

router.put('/credentials/:provider', requireAuthentication, asyncHandler(async (req, res) => {
  const { provider } = req.params
  if (!providers.has(provider)) {
    throw new ApiError(404, 'NOT_FOUND', 'Integration provider was not found.')
  }

  const accessToken = requireText(req.body?.token, 'token')
  if (accessToken.length > 10_000) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'token is too long.')
  }
  const account = await requestProviderJson(`${vercelApi}/v2/user`, accessToken, 'Vercel')
  const accountId = account.user?.id || account.id
  const accountName = account.user?.username || account.user?.name || account.user?.email || 'Vercel account'
  if (!accountId || !accountName) {
    throw new ApiError(502, 'INTEGRATION_ERROR', `${provider} did not return account details for this token.`)
  }

  getEncryptionKey()
  await saveConnection({
    userId: req.user.id,
    provider,
    providerAccountId: accountId,
    accountName,
    tokens: { accessToken, expiresAt: null },
  })

  res.json({ data: { provider, accountName } })
}))

router.delete('/:provider', requireAuthentication, asyncHandler(async (req, res) => {
  if (!providers.has(req.params.provider)) {
    throw new ApiError(404, 'NOT_FOUND', 'Integration provider was not found.')
  }
  await prisma.integrationConnection.deleteMany({
    where: { userId: req.user.id, provider: req.params.provider },
  })
  res.status(204).end()
}))

router.post('/vercel/deploy', requireAuthentication, asyncHandler(async (req, res) => {
  const name = requireText(req.body?.name, 'name')
  const pageName = requireText(req.body?.pageName, 'pageName')
  const jsx = requireText(req.body?.jsx, 'jsx')
  if (!/^[a-z0-9._-]{1,100}$/.test(name)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Project name may contain lowercase letters, numbers, dots, underscores, and hyphens.')
  }
  if (jsx.length > 1_000_000) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Generated JSX exceeds the 1 MB deployment limit.')
  }

  const { token } = await requireConnection(req.user.id, 'vercel')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  let project
  try {
    project = await requestProviderJson(`${vercelApi}/v11/projects`, token, 'Vercel', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name,
        framework: 'vite',
        installCommand: 'npm install',
        buildCommand: 'npm run build',
        outputDirectory: 'dist',
      }),
    })
  } catch (error) {
    if (error.providerStatus !== 409) throw error
    try {
      project = await requestProviderJson(
        `${vercelApi}/v9/projects/${encodeURIComponent(name)}`,
        token,
        'Vercel',
      )
    } catch (lookupError) {
      if (lookupError.providerStatus === 404) throw error
      throw lookupError
    }
  }

  const projectSettings = {
    framework: 'vite',
    installCommand: 'npm install',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
  }
  const files = createGeneratedProjectFiles(pageName, jsx).map(({ path, content }) => ({
    file: path,
    data: content,
    encoding: 'utf-8',
  }))
  const deployment = await requestProviderJson(`${vercelApi}/v13/deployments`, token, 'Vercel', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: project.name,
      project: project.id,
      target: 'production',
      files,
      projectSettings,
    }),
  })

  res.status(202).json({
    data: {
      projectId: project.id,
      projectUrl: 'https://vercel.com/dashboard',
      deploymentId: deployment.id,
      deploymentUrl: deployment.url ? `https://${deployment.url}` : null,
      deploymentState: deployment.readyState || deployment.status || 'QUEUED',
    },
  })
}))

router.post('/vercel/deploy-project', requireAuthentication, asyncHandler(async (req, res) => {
  const projectId = requireText(req.body?.projectId, 'projectId')
  const requestedPages = req.body?.pages
  if (!Array.isArray(requestedPages) || requestedPages.length < 1 || requestedPages.length > 50) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'pages must contain between 1 and 50 project pages.')
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.user.id },
    include: {
      pages: {
        where: { userId: req.user.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true },
      },
    },
  })
  if (!project) {
    throw new ApiError(404, 'NOT_FOUND', 'Project was not found.')
  }
  if (project.pages.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Add at least one page to the project before deploying.')
  }
  if (requestedPages.length !== project.pages.length) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Deploy the complete set of pages currently in the project.')
  }

  const requestedById = new Map()
  let totalJsxLength = 0
  for (const requestedPage of requestedPages) {
    const pageId = requireText(requestedPage?.pageId, 'pages[].pageId')
    if (requestedById.has(pageId)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A project page was included more than once.')
    }
    const jsx = requireText(requestedPage?.jsx, 'pages[].jsx')
    if (jsx.length > 1_000_000) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'A generated page exceeds the 1 MB deployment limit.')
    }
    totalJsxLength += jsx.length
    requestedById.set(pageId, jsx)
  }
  if (totalJsxLength > 4_000_000) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The generated project exceeds the 4 MB deployment limit.')
  }

  const pages = project.pages.map((page) => {
    const jsx = requestedById.get(page.id)
    if (!jsx) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Page "${page.name}" is missing from the deployment.`)
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Page "${page.name}" must have a URL slug containing lowercase letters, numbers, and hyphens.`)
    }
    return { ...page, jsx }
  })
  if (new Set(pages.map((page) => page.slug)).size !== pages.length) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Each page in a project must have a unique URL slug.')
  }

  const { token } = await requireConnection(req.user.id, 'vercel')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const vercelProjectName = `${project.slug}-${project.id}`
  let vercelProject
  if (project.vercelProjectId) {
    vercelProject = { id: project.vercelProjectId, name: vercelProjectName }
  } else {
    try {
      vercelProject = await requestProviderJson(`${vercelApi}/v11/projects`, token, 'Vercel', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: vercelProjectName,
          framework: 'vite',
          installCommand: 'npm install',
          buildCommand: 'npm run build',
          outputDirectory: 'dist',
        }),
      })
    } catch (error) {
      if (error.providerStatus === 409) {
        throw new ApiError(409, 'CONFLICT', 'The Vercel project name is already in use. Change the project slug and try again.')
      }
      throw error
    }
    await prisma.project.update({
      where: { id: project.id },
      data: { vercelProjectId: vercelProject.id },
    })
  }

  const projectSettings = {
    framework: 'vite',
    installCommand: 'npm install',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
  }
  const files = createGeneratedMultiPageProjectFiles(project.slug, pages).map(({ path, content }) => ({
    file: path,
    data: content,
    encoding: 'utf-8',
  }))
  const deployment = await requestProviderJson(`${vercelApi}/v13/deployments`, token, 'Vercel', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: vercelProject.name || vercelProjectName,
      project: vercelProject.id,
      target: 'production',
      files,
      projectSettings,
    }),
  })

  const result = {
    projectId: vercelProject.id,
    projectUrl: 'https://vercel.com/dashboard',
    deploymentId: deployment.id,
    deploymentUrl: deployment.url ? `https://${deployment.url}` : null,
    deploymentState: deployment.readyState || deployment.status || 'QUEUED',
  }
  await prisma.project.update({
    where: { id: project.id },
    data: { vercelProjectId: vercelProject.id, deploymentJson: result },
  })

  res.status(202).json({ data: result })
}))

export default router
