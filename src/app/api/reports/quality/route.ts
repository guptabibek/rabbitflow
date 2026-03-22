import { NextRequest, NextResponse } from 'next/server'
import { requireProjectPermission } from '@/lib/domain/auth'
import { withCache } from '@/lib/redis'
import { computeBugMetrics } from '@/lib/domain/reports'
import { parseBoundedInt } from '../_utils'

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

    const days = parseBoundedInt(searchParams.get('days'), 30, 1, 365)
    const data = await withCache(`reports:quality:${projectId}:${teamId || 'all'}:${days}`, 120, () =>
      computeBugMetrics(projectId, days, teamId)
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error computing quality report:', error)
    return NextResponse.json({ error: 'Failed to compute report' }, { status: 500 })
  }
}
