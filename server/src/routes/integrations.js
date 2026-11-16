import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { ApiError, asyncHandler, requireText } from '../api-utils.js'
import { prisma } from '../database.js'
import { createGeneratedProjectFiles } from '../generated-project.js'
import { requireAuthentication } from '../auth-middleware.js'

const router = Router()
const providers = new Set(['github', 'vercel'])
const githubApi = 'https://api.github.com'
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
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
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
  const repository = value?.repository
  if (!repository || typeof repository !== 'object') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'repository must be a GitHub repository result.')
  }
  if (!Number.isSafeInteger(repository.id) || repository.id <= 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'repository.id must be a valid GitHub repository ID.')
  }
  if (typeof repository.private !== 'boolean') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'repository.private must be a boolean.')
  }

  const normalizedRepository = {
    id: repository.id,
    fullName: requireText(repository.fullName, 'repository.fullName'),
    htmlUrl: requireHttpsUrl(repository.htmlUrl, 'repository.htmlUrl'),
    private: repository.private,
    commitSha: requireText(repository.commitSha, 'repository.commitSha'),
    branch: requireText(repository.branch, 'repository.branch'),
  }
  const deployment = value.deployment
  if (deployment === null) {
    return { repository: normalizedRepository, deployment: null }
  }
  if (!deployment || typeof deployment !== 'object') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'deployment must be a Vercel deployment result or null.')
  }

  return {
    repository: normalizedRepository,
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
  const account = provider === 'github'
    ? await requestProviderJson(`${githubApi}/user`, accessToken, 'GitHub')
    : await requestProviderJson(`${vercelApi}/v2/user`, accessToken, 'Vercel')
  const accountId = provider === 'github' ? account.id : (account.user?.id || account.id)
  const accountName = provider === 'github'
    ? account.login
    : (account.user?.username || account.user?.name || account.user?.email || 'Vercel account')
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

router.post('/github/publish', requireAuthentication, asyncHandler(async (req, res) => {
  const name = requireText(req.body?.name, 'name')
  const pageName = requireText(req.body?.pageName, 'pageName')
  const jsx = requireText(req.body?.jsx, 'jsx')

  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(name)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Repository name may contain letters, numbers, dots, underscores, and hyphens.')
  }
  if (jsx.length > 1_000_000) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Generated JSX exceeds the 1 MB publishing limit.')
  }

  const { token, connection } = await requireConnection(req.user.id, 'github')
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }

  let repository
  try {
    repository = await requestProviderJson(`${githubApi}/user/repos`, token, 'GitHub', {
      method: 'POST',
      body: JSON.stringify({ name, private: req.body?.private !== false, auto_init: true }),
    })
  } catch (error) {
    if (error.providerStatus !== 422) throw error
    try {
      repository = await requestProviderJson(
        `${githubApi}/repos/${encodeURIComponent(connection.accountName)}/${encodeURIComponent(name)}`,
        token,
        'GitHub',
      )
    } catch (lookupError) {
      if (lookupError.providerStatus === 404) throw error
      throw lookupError
    }
  }

  let commit
  try {
    const branch = repository.default_branch || 'main'
    const encodedBranch = encodeURIComponent(branch)
    let initialRef = null
    if (repository.default_branch) {
      try {
        initialRef = await requestProviderJson(
          `${githubApi}/repos/${repository.full_name}/git/ref/heads/${encodedBranch}`,
          token,
          'GitHub',
        )
      } catch (error) {
        if (error.providerStatus !== 404 && error.providerStatus !== 409) throw error
      }
    }
    if (!initialRef) {
      const initialization = await requestProviderJson(
        `${githubApi}/repos/${repository.full_name}/contents/README.md`,
        token,
        'GitHub',
        {
          method: 'PUT',
          body: JSON.stringify({
            message: 'Initialize repository',
            content: Buffer.from(`# ${name}\n`).toString('base64'),
            branch,
          }),
        },
      )
      initialRef = { object: { sha: initialization.commit.sha } }
    }
    const parentCommitSha = initialRef.object.sha
    const parentCommit = await requestProviderJson(
      `${githubApi}/repos/${repository.full_name}/git/commits/${parentCommitSha}`,
      token,
      'GitHub',
    )
    const files = createGeneratedProjectFiles(pageName, jsx)
    const tree = await requestProviderJson(`${githubApi}/repos/${repository.full_name}/git/trees`, token, 'GitHub', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: parentCommit.tree.sha,
        tree: files.map(({ path, content }) => ({
          path,
          mode: '100644',
          type: 'blob',
          content,
        })),
      }),
    })
    commit = await requestProviderJson(`${githubApi}/repos/${repository.full_name}/git/commits`, token, 'GitHub', {
      method: 'POST',
      body: JSON.stringify({
        message: `Add generated ${pageName} project`,
        tree: tree.sha,
        parents: [parentCommitSha],
      }),
    })
    await requestProviderJson(
      `${githubApi}/repos/${repository.full_name}/git/refs/heads/${encodedBranch}`,
      token,
      'GitHub',
      {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha }),
      },
    )
  } catch (error) {
    throw new ApiError(
      error.status || 502,
      'INTEGRATION_ERROR',
      `Repository ${repository.html_url} is available, but the generated project could not be pushed: ${error.message}`,
    )
  }

  res.status(201).json({
    data: {
      id: repository.id,
      fullName: repository.full_name,
      htmlUrl: repository.html_url,
      private: repository.private,
      commitSha: commit.sha,
      branch: repository.default_branch || 'main',
    },
  })
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

export default router
