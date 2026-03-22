import { NextRequest, NextResponse } from 'next/server'
import { requireProjectPermission } from '@/lib/domain/auth'
import { withCache } from '@/lib/redis'
import { computeForecast } from '@/lib/domain/reports'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const teamId = searchParams.get('teamId') || undefined

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const data = await withCache(`reports:forecast:${projectId}:${teamId || 'all'}`, 300, () =>
      computeForecast(projectId, teamId)
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error computing forecast:', error)
    return NextResponse.json({ error: 'Failed to compute forecast' }, { status: 500 })
  }
}
