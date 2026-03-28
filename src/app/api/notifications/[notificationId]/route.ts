import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import {
  markNotificationRead,
  archiveNotification,
} from '@/lib/domain/notification-service'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { notificationId: id } = await params

    const body = await request.json()
    const action = body.action as string

    if (action === 'read') {
      await markNotificationRead(id, auth.user.id)
      return NextResponse.json({ success: true })
    }

    if (action === 'archive') {
      await archiveNotification(id, auth.user.id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action. Use "read" or "archive".' }, { status: 400 })
  } catch (error) {
    console.error('Error updating notification:', error)
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
  }
}
