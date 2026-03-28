import { db, runWithDbRetry } from '@/lib/db'
import { enqueueEmail } from '@/lib/email-queue'

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export type NotificationType =
  | 'mention'
  | 'assignment'
  | 'comment'
  | 'status_change'
  | 'state_transition'
  | 'approval_requested'
  | 'approval_decision'
  | 'due_date_approaching'
  | 'sla_breach'
  | 'automation_triggered'
  | 'automation_failed'
  | 'import_completed'
  | 'webhook_failed'

export type NotificationChannel = 'in_app' | 'email'

export type NotificationCategory =
  | 'mentions'
  | 'assignments'
  | 'comments'
  | 'status_updates'
  | 'approvals'
  | 'sla'
  | 'system'

const TYPE_TO_CATEGORY: Record<NotificationType, NotificationCategory> = {
  mention: 'mentions',
  assignment: 'assignments',
  comment: 'comments',
  status_change: 'status_updates',
  state_transition: 'status_updates',
  approval_requested: 'approvals',
  approval_decision: 'approvals',
  due_date_approaching: 'system',
  sla_breach: 'sla',
  automation_triggered: 'system',
  automation_failed: 'system',
  import_completed: 'system',
  webhook_failed: 'system',
}

const PROJECT_OPERATOR_ROLES = new Set(['Admin', 'PM', 'DevOps'])

function hasOperationsPermission(extraPermissions: unknown): boolean {
  return Array.isArray(extraPermissions) && extraPermissions.includes('operations:manage')
}

export async function getProjectOperatorUserIds(projectId: string): Promise<string[]> {
  const members = await db.projectMember.findMany({
    where: { projectId },
    select: {
      userId: true,
      role: true,
      extraPermissions: true,
    },
  })

  return Array.from(
    new Set(
      members
        .filter(
          (member) =>
            PROJECT_OPERATOR_ROLES.has(member.role) ||
            hasOperationsPermission(member.extraPermissions)
        )
        .map((member) => member.userId)
    )
  )
}

export async function getProjectAuditActorUserId(
  projectId: string,
  preferredUserId?: string | null
): Promise<string | null> {
  if (preferredUserId) {
    const preferredMember = await db.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: preferredUserId,
        },
      },
      select: { userId: true },
    })

    if (preferredMember) {
      return preferredMember.userId
    }
  }

  const [operatorId] = await getProjectOperatorUserIds(projectId)
  if (operatorId) {
    return operatorId
  }

  const fallbackMember = await db.projectMember.findFirst({
    where: { projectId },
    orderBy: { joinedAt: 'asc' },
    select: { userId: true },
  })

  return fallbackMember?.userId ?? null
}

export async function notifyProjectOperators(
  projectId: string,
  template: Omit<CreateNotificationInput, 'userId' | 'projectId'>
) {
  const operatorIds = await getProjectOperatorUserIds(projectId)
  if (operatorIds.length === 0) {
    return
  }

  await createNotifications(operatorIds, {
    ...template,
    projectId,
  })
}

// ============================================================================
// CREATE NOTIFICATIONS
// ============================================================================

export type CreateNotificationInput = {
  userId: string
  projectId?: string | null
  issueId?: string | null
  actorId?: string | null
  type: NotificationType
  title: string
  body?: string | null
  entityType?: string | null
  entityId?: string | null
  actionUrl?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Creates in-app notification(s) and optionally sends email based on user preferences.
 * Deduplicates: won't notify actor about their own action.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string | null> {
  // Never notify users about their own actions
  if (input.actorId && input.userId === input.actorId) return null

  const category = TYPE_TO_CATEGORY[input.type] ?? 'system'

  // Check user preference for in-app
  const inAppPref = await db.notificationPreference.findUnique({
    where: {
      userId_channel_category: {
        userId: input.userId,
        channel: 'in_app',
        category,
      },
    },
    select: { enabled: true },
  })

  // Default to enabled if no preference is set
  if (inAppPref && !inAppPref.enabled) return null

  const notification = await db.notification.create({
    data: {
      userId: input.userId,
      projectId: input.projectId ?? undefined,
      issueId: input.issueId ?? undefined,
      actorId: input.actorId ?? undefined,
      type: input.type,
      title: input.title,
      body: input.body ?? undefined,
      entityType: input.entityType ?? undefined,
      entityId: input.entityId ?? undefined,
      actionUrl: input.actionUrl ?? undefined,
      metadata: (input.metadata ?? undefined) as import('@prisma/client').Prisma.InputJsonValue | undefined,
    },
  })

  return notification.id
}

/**
 * Batch-create notifications for multiple recipients.
 */
export async function createNotifications(
  recipientIds: string[],
  template: Omit<CreateNotificationInput, 'userId'>
): Promise<void> {
  const uniqueRecipients = Array.from(new Set(recipientIds)).filter(
    (id) => id !== template.actorId
  )

  if (uniqueRecipients.length === 0) return

  const category = TYPE_TO_CATEGORY[template.type] ?? 'system'

  // Batch-check preferences
  const disabledPrefs = await db.notificationPreference.findMany({
    where: {
      userId: { in: uniqueRecipients },
      channel: 'in_app',
      category,
      enabled: false,
    },
    select: { userId: true },
  })

  const disabledUserIds = new Set(disabledPrefs.map((p) => p.userId))
  const enabledRecipients = uniqueRecipients.filter((id) => !disabledUserIds.has(id))

  if (enabledRecipients.length === 0) return

  await db.notification.createMany({
    data: enabledRecipients.map((userId) => ({
      userId,
      projectId: template.projectId ?? undefined,
      issueId: template.issueId ?? undefined,
      actorId: template.actorId ?? undefined,
      type: template.type,
      title: template.title,
      body: template.body ?? undefined,
      entityType: template.entityType ?? undefined,
      entityId: template.entityId ?? undefined,
      actionUrl: template.actionUrl ?? undefined,
      metadata: (template.metadata ?? undefined) as import('@prisma/client').Prisma.InputJsonValue | undefined,
    })),
  })

  // Also send emails for users who have email channel enabled
  const emailPrefs = await db.notificationPreference.findMany({
    where: {
      userId: { in: enabledRecipients },
      channel: 'email',
      category,
      enabled: true,
    },
    select: { userId: true },
  })

  if (emailPrefs.length > 0) {
    const emailUserIds = emailPrefs.map((p) => p.userId)
    const emailUsers = await db.user.findMany({
      where: { id: { in: emailUserIds } },
      select: { id: true, email: true, name: true },
    })

    await Promise.allSettled(
      emailUsers
        .filter((u) => Boolean(u.email))
        .map((u) =>
          enqueueEmail({
            to: u.email,
            subject: template.title,
            text: template.body ?? template.title,
          })
        )
    )
  }
}

// ============================================================================
// QUERY NOTIFICATIONS
// ============================================================================

export type NotificationFilter = {
  userId: string
  isRead?: boolean
  isArchived?: boolean
  type?: NotificationType
  projectId?: string
}

export async function getNotifications(
  filter: NotificationFilter,
  page: number,
  pageSize: number
) {
  const where: Record<string, unknown> = {
    userId: filter.userId,
    isArchived: filter.isArchived ?? false,
  }

  if (filter.isRead !== undefined) where.isRead = filter.isRead
  if (filter.type) where.type = filter.type
  if (filter.projectId) where.projectId = filter.projectId

  const [notifications, total] = await runWithDbRetry(() =>
    Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          actor: {
            select: { id: true, name: true, avatar: true },
          },
          project: {
            select: { id: true, key: true, name: true, color: true },
          },
        },
      }),
      db.notification.count({ where }),
    ])
  )

  return { notifications, total }
}

export async function getUnreadCount(userId: string): Promise<number> {
  return runWithDbRetry(() =>
    db.notification.count({
      where: {
        userId,
        isRead: false,
        isArchived: false,
      },
    })
  )
}

// ============================================================================
// MARK READ / ARCHIVE
// ============================================================================

export async function markNotificationRead(notificationId: string, userId: string) {
  return db.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true, readAt: new Date() },
  })
}

export async function markAllNotificationsRead(userId: string, projectId?: string) {
  const where: Record<string, unknown> = {
    userId,
    isRead: false,
    isArchived: false,
  }
  if (projectId) where.projectId = projectId

  return runWithDbRetry(() =>
    db.notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    })
  )
}

export async function archiveNotification(notificationId: string, userId: string) {
  return db.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isArchived: true, archivedAt: new Date() },
  })
}

export async function archiveAllNotifications(userId: string) {
  return runWithDbRetry(() =>
    db.notification.updateMany({
      where: { userId, isArchived: false },
      data: { isArchived: true, archivedAt: new Date() },
    })
  )
}

// ============================================================================
// PREFERENCES
// ============================================================================

export async function getNotificationPreferences(userId: string) {
  return db.notificationPreference.findMany({
    where: { userId },
    orderBy: [{ channel: 'asc' }, { category: 'asc' }],
  })
}

export async function upsertNotificationPreference(
  userId: string,
  channel: NotificationChannel,
  category: NotificationCategory,
  enabled: boolean
) {
  return db.notificationPreference.upsert({
    where: {
      userId_channel_category: {
        userId,
        channel,
        category,
      },
    },
    create: { userId, channel, category, enabled },
    update: { enabled },
  })
}

// ============================================================================
// CLEANUP
// ============================================================================

export async function cleanupOldNotifications(olderThanDays = 90): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - olderThanDays)

  const result = await db.notification.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      isArchived: true,
    },
  })

  return result.count
}
