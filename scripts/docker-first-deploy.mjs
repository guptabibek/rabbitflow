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
  console.log(`Created ${envFile} from ${envExampleFile}.`) 
  console.log('Update secrets in .env.docker before exposing this stack publicly.')
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
