import { copyFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const envFile = '.env.docker'
const envExampleFile = '.env.docker.example'

if (!existsSync(envFile)) {
  if (!existsSync(envExampleFile)) {
    console.error(`Missing ${envExampleFile}. Cannot continue.`)
    process.exit(1)
  }

  copyFileSync(envExampleFile, envFile)
  // The compose file has no default secrets or administrator, so starting now
  // would only fail. Stop and let the required values be filled in first.
  console.log(`Created ${envFile} from ${envExampleFile}.`)
  console.log(
    'Fill in JWT_SECRET, CRON_SECRET, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env.docker, then run this command again.'
  )
  process.exit(1)
}

const result = spawnSync(
  'docker',
  ['compose', '--env-file', envFile, 'up', '-d', '--build'],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 0)
