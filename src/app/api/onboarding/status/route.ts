import { NextRequest, NextResponse } from 'next/server'
import { evaluateOnboardingStatus } from '@/lib/domain/onboarding-engine'
import { requireProjectPermission, requireAuthenticatedUser } from '@/lib/domain/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const status = await evaluateOnboardingStatus(
      auth.actor.userId,
      projectId,
      auth.actor.projectRole
    )

    return NextResponse.json(status)
  } catch (error) {
    console.error('Error fetching onboarding status:', error)
    return NextResponse.json({ error: 'Failed to fetch onboarding status' }, { status: 500 })
  }
}
