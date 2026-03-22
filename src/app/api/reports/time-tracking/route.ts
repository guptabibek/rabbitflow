import { NextRequest, NextResponse } from 'next/server'
import { requireProjectPermission } from '@/lib/domain/auth'
import { withCache } from '@/lib/redis'
import { computeTimeTracking } from '@/lib/domain/reports'
import { parseBoundedFloat } from '../_utils'

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

    const iterationId = searchParams.get('iterationId') || undefined
    const costPerHour = parseBoundedFloat(searchParams.get('costPerHour'), 0, 0, 100000)

    const cacheKey = `reports:time:${projectId}:${teamId || 'all'}:${iterationId || 'all'}:${costPerHour}`
    const data = await withCache(cacheKey, 60, () =>
      computeTimeTracking(projectId, { iterationId, teamId, costPerHour })
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error computing time tracking report:', error)
    return NextResponse.json({ error: 'Failed to compute time tracking report' }, { status: 500 })
  }
}
