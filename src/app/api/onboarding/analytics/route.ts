import { NextRequest, NextResponse } from 'next/server'
import { getOnboardingAnalytics } from '@/lib/domain/onboarding-engine'
import { requireOnboardingManager } from '@/lib/domain/onboarding-access'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireOnboardingManager(request, projectId)
    if (!auth.ok) return auth.response

    const analytics = await getOnboardingAnalytics(projectId)
    return NextResponse.json(analytics)
  } catch (error) {
    console.error('Error fetching onboarding analytics:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
