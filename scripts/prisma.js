import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { createRequire } from 'node:module'
import { cleanupDatabaseConfig, getDatabaseUrl } from '../server/src/database-config.js'

const require = createRequire(import.meta.url)
const prismaCli = require.resolve('prisma/build/index.js')

try {
  const result = spawnSync(
    process.execPath,
    [prismaCli, ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: getDatabaseUrl() },
    },
  )

  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  cleanupDatabaseConfig()
}
