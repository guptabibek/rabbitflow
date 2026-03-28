import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordOnboardingEvent } from '@/lib/domain/onboarding-engine'
import { requireProjectPermission } from '@/lib/domain/auth'

const eventSchema = z.object({
  projectId: z.string().trim().min(1),
  stepKey: z.string().trim().min(1).max(100),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = eventSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'project:read')
    if (!auth.ok) return auth.response

    await recordOnboardingEvent(auth.actor.userId, data.projectId, data.stepKey)

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error recording onboarding event:', error)
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
  }
}
