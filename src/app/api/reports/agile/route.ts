import { NextRequest, NextResponse } from 'next/server'
import { requireProjectPermission } from '@/lib/domain/auth'
import { withCache } from '@/lib/redis'
import {
  computeSprintBurndown,
  computeVelocity,
  computeCumulativeFlow,
  computeLeadCycleTime,
} from '@/lib/domain/reports'
import { parseBoundedInt, parseDate } from '../_utils'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const report = searchParams.get('report')
    const teamId = searchParams.get('teamId') || undefined

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    switch (report) {
      case 'burndown': {
        const sprintId = searchParams.get('sprintId')
        if (!sprintId) {
          return NextResponse.json({ error: 'sprintId is required for burndown' }, { status: 400 })
        }
        const data = await withCache(`reports:sprint:burndown:${sprintId}:${teamId || 'all'}`, 60, () =>
          computeSprintBurndown(sprintId, teamId)
        )
        return NextResponse.json(data)
      }

      case 'velocity': {
        const lastN = parseBoundedInt(searchParams.get('lastN'), 10, 1, 52)
        const data = await withCache(`reports:velocity:${projectId}:${teamId || 'all'}:${lastN}`, 120, () =>
          computeVelocity(projectId, lastN, teamId)
        )
        return NextResponse.json(data)
      }

      case 'cumulative-flow': {
        const days = parseBoundedInt(searchParams.get('days'), 30, 1, 365)
        const data = await withCache(`reports:cfd:${projectId}:${teamId || 'all'}:${days}`, 120, () =>
          computeCumulativeFlow(projectId, days, teamId)
        )
        return NextResponse.json(data)
      }

      case 'lead-cycle-time': {
        const fromStr = searchParams.get('from')
        const toStr = searchParams.get('to')
        const from = parseDate(fromStr)
        const to = parseDate(toStr)
        const range = from && to && from <= to ? { from, to } : undefined
        const fromKey = from ? from.toISOString().slice(0, 10) : 'all'
        const toKey = to ? to.toISOString().slice(0, 10) : 'all'
        const cacheKey = `reports:lct:${projectId}:${teamId || 'all'}:${fromKey}:${toKey}`
        const data = await withCache(cacheKey, 120, () =>
          computeLeadCycleTime(projectId, range, teamId)
        )
        return NextResponse.json(data)
      }

      default:
        return NextResponse.json(
          { error: 'Invalid report type. Use: burndown, velocity, cumulative-flow, lead-cycle-time' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error computing agile report:', error)
    return NextResponse.json({ error: 'Failed to compute report' }, { status: 500 })
  }
}
