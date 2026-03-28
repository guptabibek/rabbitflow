import type { Prisma, PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

type IssueKeyClient = PrismaClient | Prisma.TransactionClient

export async function lockProjectIssueSequence(
  tx: Prisma.TransactionClient,
  projectId: string
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`
}

export async function getMaxProjectIssueNumber(
  client: IssueKeyClient,
  projectId: string,
  projectKey: string
) {
  const rows = await client.$queryRaw<Array<{ maxIssueNumber: number | bigint | null }>>`
    SELECT COALESCE(MAX(CAST(substring("key" FROM '[0-9]+$') AS INTEGER)), 0) AS "maxIssueNumber"
    FROM "Issue"
    WHERE "projectId" = ${projectId}
      AND "key" LIKE ${`${projectKey}-%`}
  `

  const maxIssueNumber = rows[0]?.maxIssueNumber ?? 0
  if (typeof maxIssueNumber === 'bigint') {
    return Number(maxIssueNumber)
  }

  return maxIssueNumber
}