import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import {
  getNotificationPreferences,
  upsertNotificationPreference,
} from '@/lib/domain/notification-service'
import type { NotificationChannel, NotificationCategory } from '@/lib/domain/notification-service'

const VALID_CHANNELS: NotificationChannel[] = ['in_app', 'email']
const VALID_CATEGORIES: NotificationCategory[] = [
  'mentions', 'assignments', 'comments', 'status_updates', 'approvals', 'sla', 'system',
]

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const preferences = await getNotificationPreferences(auth.user.id)

    // Build full matrix with defaults
    const matrix: Record<string, Record<string, boolean>> = {}
    for (const channel of VALID_CHANNELS) {
      matrix[channel] = {}
      for (const category of VALID_CATEGORIES) {
        matrix[channel][category] = true // default enabled
      }
    }

    for (const pref of preferences) {
      if (matrix[pref.channel]) {
        matrix[pref.channel][pref.category] = pref.enabled
      }
    }

    return NextResponse.json(matrix)
  } catch (error) {
    console.error('Error fetching notification preferences:', error)
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
  }
}

const updatePreferenceSchema = z.object({
  channel: z.enum(['in_app', 'email']),
  category: z.enum([
    'mentions', 'assignments', 'comments', 'status_updates', 'approvals', 'sla', 'system',
  ]),
  enabled: z.boolean(),
})

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updatePreferenceSchema.parse(body)

    await upsertNotificationPreference(
      auth.user.id,
      data.channel,
      data.category,
      data.enabled
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating notification preference:', error)
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 })
  }
}
