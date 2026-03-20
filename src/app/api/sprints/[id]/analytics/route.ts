import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { withCache, cacheInvalidate } from '@/lib/redis'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sprintId } = await params

    const sprint = await db.iteration.findUnique({
      where: { id: sprintId },
      select: {
        id: true,
        name: true,
        goal: true,
        startDate: true,
        endDate: true,
        status: true,
        projectId: true,
        iterationType: true,
      },
    })

    if (!sprint || sprint.iterationType !== 'sprint') {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      sprint.projectId,
      'project:read'
    )
    if (!auth.ok) return auth.response

    const data = await withCache(
      `sprint-analytics:${sprintId}`,
      60,
      () => computeAnalytics(sprintId, sprint)
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error computing sprint analytics:', error)
    return NextResponse.json(
      { error: 'Failed to compute analytics' },
      { status: 500 }
    )
  }
}

// Allow POST to invalidate cache
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sprint = await db.iteration.findUnique({
    where: { id },
    select: { projectId: true, iterationType: true },
  })

  if (!sprint || sprint.iterationType !== 'sprint') {
    return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
  }

  const auth = await requireProjectPermission(request, sprint.projectId, 'sprint:manage')
  if (!auth.ok) return auth.response

  await cacheInvalidate(`sprint-analytics:${id}`)
  return NextResponse.json({ success: true })
}

interface SprintInfo {
  id: string
  startDate: Date | null
  endDate: Date | null
  status: string
}

async function computeAnalytics(sprintId: string, sprint: SprintInfo) {
  const issues = await db.issue.findMany({
    where: { iterationId: sprintId },
    select: {
      id: true,
      status: true,
      workItemType: true,
      storyPoints: true,
      completedDate: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const totalItems = issues.length
  const completedIssues = issues.filter((i) => i.status === 'done')
  const completedItems = completedIssues.length
  const remainingItems = totalItems - completedItems

  const totalPoints = issues.reduce((s, i) => s + (i.storyPoints || 0), 0)
  const completedPoints = completedIssues.reduce(
    (s, i) => s + (i.storyPoints || 0),
    0
  )
  const remainingPoints = totalPoints - completedPoints

  // --- Burndown chart data ---
  const burndown: Array<{
    date: string
    remaining: number
    ideal: number
    completed: number
  }> = []

  if (sprint.startDate && sprint.endDate) {
    const start = new Date(sprint.startDate)
    const end = new Date(sprint.endDate)
    const now = new Date()
    const burndownEnd = end < now ? end : now

    const totalDays = Math.max(
      1,
      Math.ceil(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      )
    )

    const current = new Date(start)
    let dayIndex = 0

    while (current <= burndownEnd) {
      const dayEnd = new Date(current)
      dayEnd.setHours(23, 59, 59, 999)

      const completedByDay = issues.filter((i) => {
        if (i.status !== 'done') return false
        const effectiveDate = i.completedDate || i.updatedAt
        return effectiveDate <= dayEnd
      })

      const completedPts = completedByDay.reduce(
        (s, i) => s + (i.storyPoints || 0),
        0
      )

      const ideal = Math.max(
        0,
        Math.round(totalPoints * (1 - dayIndex / totalDays) * 10) / 10
      )

      burndown.push({
        date: current.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        remaining: totalPoints - completedPts,
        ideal,
        completed: completedPts,
      })

      current.setDate(current.getDate() + 1)
      dayIndex++
    }
  }

  // --- By type ---
  const typeMap: Record<string, number> = {}
  for (const i of issues) {
    typeMap[i.workItemType] = (typeMap[i.workItemType] || 0) + 1
  }
  const byType = Object.entries(typeMap).map(([name, value]) => ({
    name,
    value,
  }))

  // --- By status ---
  const statusMap: Record<string, number> = {}
  for (const i of issues) {
    statusMap[i.status] = (statusMap[i.status] || 0) + 1
  }
  const byStatus = Object.entries(statusMap).map(([name, value]) => ({
    name,
    value,
  }))

  return {
    stats: {
      totalItems,
      completedItems,
      remainingItems,
      totalPoints,
      completedPoints,
      remainingPoints,
    },
    burndown,
    byType,
    byStatus,
  }
}
