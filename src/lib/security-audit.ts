import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export type SecurityAuditAction =
  | 'MFA_DISABLED'
  | 'MFA_ENFORCED'
  | 'MFA_RESET_ONLY'
  | 'MFA_RESET_WITH_SESSION_REVOKE'
  | 'SESSION_REVOKED'
  | 'SESSIONS_REVOKED_ALL'
  | 'USER_DEACTIVATED'

export async function createSecurityAuditEvent(args: {
  actorUserId: string
  targetUserId: string
  action: SecurityAuditAction
  details?: Prisma.InputJsonValue
}) {
  return db.securityAuditEvent.create({
    data: {
      actorUserId: args.actorUserId,
      targetUserId: args.targetUserId,
      action: args.action,
      details: args.details,
    },
  })
}
