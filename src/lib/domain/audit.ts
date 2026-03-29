import type { Prisma, PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

type AuditPayload = {
  projectId: string
  issueId?: string | null
  userId: string
  action: string
  details?: Record<string, unknown> | null
}

type AuditClient = Prisma.TransactionClient | PrismaClient

export async function createAuditLog(payload: AuditPayload, client: AuditClient = db) {
  await client.activity.create({
    data: {
      projectId: payload.projectId,
      issueId: payload.issueId ?? undefined,
      userId: payload.userId,
      action: payload.action,
      details: payload.details ? JSON.stringify(payload.details) : null,
    },
  })
}
