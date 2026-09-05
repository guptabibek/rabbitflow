import nextEnv from '@next/env'
import { PrismaClient } from '@prisma/client'
import {
  SYSTEM_RECORDS_VERSION,
  provisionProjectSystemRecords,
} from '../src/lib/domain/project-bootstrap.ts'

/**
 * Provision system records for any project whose stamp is behind.
 *
 * Run after a deploy that bumps SYSTEM_RECORDS_VERSION, so the work happens
 * once, deliberately, rather than inside whichever user request happens to
 * arrive first.
 *
 *   node --experimental-strip-types scripts/backfill-system-records.mts
 */

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not configured')
}

const db = new PrismaClient()

async function main() {
  const stale = await db.project.findMany({
    where: { systemRecordsVersion: { lt: SYSTEM_RECORDS_VERSION } },
    select: { id: true, key: true },
    orderBy: { createdAt: 'asc' },
  })

  if (stale.length === 0) {
    console.log(`All projects are at system records version ${SYSTEM_RECORDS_VERSION}.`)
    return
  }

  console.log(`Provisioning ${stale.length} project(s) to version ${SYSTEM_RECORDS_VERSION}...`)

  let succeeded = 0
  const failures: Array<{ key: string; error: string }> = []

  // Serial on purpose: each provisioning is a long transaction touching shared
  // tables, so running them concurrently invites lock contention.
  for (const project of stale) {
    try {
      await provisionProjectSystemRecords(project.id)
      succeeded += 1
      console.log(`  ok    ${project.key}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ key: project.key, error: message })
      console.error(`  FAIL  ${project.key}: ${message}`)
    }
  }

  console.log(`\nProvisioned ${succeeded}/${stale.length}.`)

  if (failures.length > 0) {
    // Non-zero exit so a deployment pipeline notices.
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error('Backfill failed.')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
