import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resetOnboardingState } from '@/lib/domain/onboarding-engine'
import { requireProjectPermission } from '@/lib/domain/auth'

const resetSchema = z.object({
  projectId: z.string().trim().min(1),
  userId: z.string().trim().min(1).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = resetSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'onboarding:manage')
    if (!auth.ok) return auth.response

    const targetUserId = data.userId ?? auth.actor.userId
    await resetOnboardingState(targetUserId, data.projectId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error resetting onboarding:', error)
    return NextResponse.json({ error: 'Failed to reset onboarding' }, { status: 500 })
  }
}
