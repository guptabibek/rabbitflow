import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  dismissOnboardingStep,
  dismissOnboardingChecklist,
} from '@/lib/domain/onboarding-engine'
import { requireProjectPermission } from '@/lib/domain/auth'

const dismissSchema = z.object({
  projectId: z.string().trim().min(1),
  stepKey: z.string().trim().min(1).max(100).optional(),
  dismissAll: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = dismissSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'project:read')
    if (!auth.ok) return auth.response

    if (data.dismissAll) {
      await dismissOnboardingChecklist(auth.actor.userId, data.projectId)
    } else if (data.stepKey) {
      await dismissOnboardingStep(auth.actor.userId, data.projectId, data.stepKey)
    } else {
      return NextResponse.json({ error: 'stepKey or dismissAll is required' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error dismissing onboarding:', error)
    return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 })
  }
}
