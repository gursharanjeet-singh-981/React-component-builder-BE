import { Buffer } from 'node:buffer'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import process, { loadEnvFile } from 'node:process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const envFile = new URL('../../.env', import.meta.url)
let certificateDirectory

if (existsSync(envFile)) {
  loadEnvFile(envFile)
}

export function getDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL must be configured. Copy .env.example to .env in the project root and set DATABASE_URL to your PostgreSQL connection URL, or provide it through the environment.'
    )
  }

  const databaseUrl = new URL(process.env.DATABASE_URL)
  const certificate = process.env.DATABASE_CA_BASE64

  if (certificate) {
    const ca = Buffer.from(certificate, 'base64')
    if (!ca.length) {
      throw new Error('DATABASE_CA_BASE64 must contain a valid CA certificate.')
    }

    certificateDirectory = mkdtempSync(join(tmpdir(), 'component-builder-prisma-'))
    const certificatePath = join(certificateDirectory, 'database-ca.pem')
    writeFileSync(certificatePath, ca, { mode: 0o600 })

    for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
      databaseUrl.searchParams.delete(parameter)
    }
    databaseUrl.searchParams.set('sslmode', 'verify-full')
    databaseUrl.searchParams.set('sslrootcert', certificatePath)
  }

  return databaseUrl.toString()
}

export function cleanupDatabaseConfig() {
  if (certificateDirectory) {
    rmSync(certificateDirectory, { recursive: true, force: true })
    certificateDirectory = undefined
  }
}
