import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  archiveAllNotifications,
} from '@/lib/domain/notification-service'

const VALID_TYPES = [
  'mention', 'assignment', 'comment', 'status_change', 'state_transition',
  'approval_requested', 'approval_decision', 'due_date_approaching',
  'sla_breach', 'automation_triggered', 'automation_failed', 'import_completed', 'webhook_failed',
] as const

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const isRead = searchParams.get('isRead')
    const isArchived = searchParams.get('isArchived')
    const type = searchParams.get('type')
    const projectId = searchParams.get('projectId')
    const countOnly = searchParams.get('countOnly') === 'true'
    const pageRaw = Number.parseInt(searchParams.get('page') || '1', 10)
    const pageSizeRaw = Number.parseInt(searchParams.get('pageSize') || '30', 10)
    const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw
    const pageSize = Number.isNaN(pageSizeRaw) || pageSizeRaw < 1 ? 30 : Math.min(pageSizeRaw, 100)

    if (countOnly) {
      const count = await getUnreadCount(auth.user.id)
      return NextResponse.json({ unreadCount: count })
    }

    const filter: Record<string, unknown> = { userId: auth.user.id }
    if (isRead !== null) filter.isRead = isRead === 'true'
    if (isArchived !== null) filter.isArchived = isArchived === 'true'
    if (type && VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) filter.type = type
    if (projectId) filter.projectId = projectId

    const result = await getNotifications(filter as Parameters<typeof getNotifications>[0], page, pageSize)

    return NextResponse.json(result.notifications, {
      headers: {
        'x-total-count': String(result.total),
        'x-page': String(page),
        'x-page-size': String(pageSize),
      },
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

const bulkActionSchema = z.object({
  action: z.enum(['mark_all_read', 'archive_all']),
  projectId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = bulkActionSchema.parse(body)

    if (data.action === 'mark_all_read') {
      await markAllNotificationsRead(auth.user.id, data.projectId)
      return NextResponse.json({ success: true })
    }

    if (data.action === 'archive_all') {
      await archiveAllNotifications(auth.user.id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error processing notification action:', error)
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 })
  }
}
