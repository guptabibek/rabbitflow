import { db } from '@/lib/db'

type AuditPayload = {
  projectId: string
  issueId?: string | null
  userId: string
  action: string
  details?: Record<string, unknown> | null
}

export async function createAuditLog(payload: AuditPayload) {
  await db.activity.create({
    data: {
      projectId: payload.projectId,
      issueId: payload.issueId ?? undefined,
      userId: payload.userId,
      action: payload.action,
      details: payload.details ? JSON.stringify(payload.details) : null,
    },
  })
}
