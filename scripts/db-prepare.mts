import nextEnv from '@next/env'
import { PrismaClient } from '@prisma/client'
import { ensureProjectSystemRecordsTx } from '../src/lib/domain/project-system-records.ts'

const { loadEnvConfig } = nextEnv

loadEnvConfig(process.cwd())

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not configured')
}

const db = new PrismaClient()

async function main() {
  const projects = await db.project.findMany({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  for (const project of projects) {
    await db.$transaction((tx) => ensureProjectSystemRecordsTx(tx, project.id), {
      maxWait: 10_000,
      timeout: 60_000,
    })
  }

  console.log(`Prepared ${projects.length} project(s) for schema sync.`)
}

main()
  .catch((error) => {
    console.error('Database prepare step failed.')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
