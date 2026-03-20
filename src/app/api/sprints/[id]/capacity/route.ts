import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { cacheInvalidate, withCache } from '@/lib/redis'
import { z } from 'zod'
import { differenceInBusinessDays } from 'date-fns'

const upsertCapacitySchema = z.object({
  userId: z.string().min(1),
  hoursPerDay: z.number().min(0).max(24).default(8),
  daysOff: z.number().int().min(0).default(0),
  notes: z.string().optional(),
})

const bulkCapacitySchema = z.object({
  capacities: z.array(upsertCapacitySchema),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sprint = await db.iteration.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        teamId: true,
        startDate: true,
        endDate: true,
        iterationType: true,
      },
    })
    if (!sprint) return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    if (sprint.iterationType !== 'sprint') {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, sprint.projectId, 'project:read')
    if (!auth.ok) return auth.response

    const payload = await withCache(`sprint-capacity:${id}`, 30, async () => {
      const capacities = await db.sprintCapacity.findMany({
        where: { iterationId: id },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
        orderBy: { user: { name: 'asc' } },
      })

      const members = sprint.teamId
        ? await db.teamMember.findMany({
            where: { teamId: sprint.teamId },
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true } },
            },
            orderBy: { user: { name: 'asc' } },
          })
        : await db.projectMember.findMany({
            where: { projectId: sprint.projectId },
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true } },
            },
            orderBy: { user: { name: 'asc' } },
          })

      let sprintDays = 10
      if (sprint.startDate && sprint.endDate) {
        sprintDays = Math.max(1, differenceInBusinessDays(sprint.endDate, sprint.startDate))
      }

      const assignedWork = await db.issue.groupBy({
        by: ['assigneeId'],
        where: { iterationId: id, assigneeId: { not: null } },
        _sum: { storyPoints: true },
        _count: { id: true },
      })

      const assignedMap = new Map(
        assignedWork.map((assignment) => [
          assignment.assigneeId,
          { points: assignment._sum.storyPoints || 0, count: assignment._count.id },
        ])
      )

      const capacityMap = new Map(capacities.map((capacity) => [capacity.userId, capacity]))

      const result = members.map((member) => {
        const cap = capacityMap.get(member.userId)
        const assigned = assignedMap.get(member.userId) || { points: 0, count: 0 }
        const hoursPerDay = cap?.hoursPerDay ?? 8
        const daysOff = cap?.daysOff ?? 0
        const availableDays = Math.max(0, sprintDays - daysOff)
        const totalCapacity = availableDays * hoursPerDay

        return {
          id: cap?.id || null,
          userId: member.userId,
          user: member.user,
          role: member.role,
          hoursPerDay,
          daysOff,
          totalCapacity,
          assignedPoints: assigned.points,
          assignedItems: assigned.count,
          notes: cap?.notes || null,
        }
      })

      return {
        capacities: result,
        totals: {
          totalCapacity: result.reduce((sum, entry) => sum + entry.totalCapacity, 0),
          totalAssignedPoints: result.reduce((sum, entry) => sum + entry.assignedPoints, 0),
          totalAssignedItems: result.reduce((sum, entry) => sum + entry.assignedItems, 0),
          sprintDays,
          memberCount: result.length,
        },
      }
    })

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching capacity:', error)
    return NextResponse.json({ error: 'Failed to fetch capacity' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sprint = await db.iteration.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        teamId: true,
        startDate: true,
        endDate: true,
        iterationType: true,
      },
    })
    if (!sprint) return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    if (sprint.iterationType !== 'sprint') {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, sprint.projectId, 'sprint:manage')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const parsed = bulkCapacitySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Validation failed' }, { status: 400 })
    }

    if (parsed.data.capacities.length > 0) {
      const validMemberships = sprint.teamId
        ? await db.teamMember.findMany({
            where: {
              teamId: sprint.teamId,
              userId: { in: parsed.data.capacities.map((cap) => cap.userId) },
            },
            select: { userId: true },
          })
        : await db.projectMember.findMany({
            where: {
              projectId: sprint.projectId,
              userId: { in: parsed.data.capacities.map((cap) => cap.userId) },
            },
            select: { userId: true },
          })

      if (
        validMemberships.length !==
        new Set(parsed.data.capacities.map((cap) => cap.userId)).size
      ) {
        return NextResponse.json(
          { error: 'Capacity entries must belong to the sprint team' },
          { status: 400 }
        )
      }
    }

    let sprintDays = 10
    if (sprint.startDate && sprint.endDate) {
      sprintDays = Math.max(1, differenceInBusinessDays(sprint.endDate, sprint.startDate))
    }

    // Upsert each capacity entry
    const results = await Promise.all(
      parsed.data.capacities.map(async (cap) => {
        const availableDays = Math.max(0, sprintDays - cap.daysOff)
        const totalCapacity = availableDays * cap.hoursPerDay

        return db.sprintCapacity.upsert({
          where: {
            iterationId_userId: { iterationId: id, userId: cap.userId },
          },
          create: {
            iterationId: id,
            userId: cap.userId,
            hoursPerDay: cap.hoursPerDay,
            daysOff: cap.daysOff,
            totalCapacity,
            notes: cap.notes,
          },
          update: {
            hoursPerDay: cap.hoursPerDay,
            daysOff: cap.daysOff,
            totalCapacity,
            notes: cap.notes,
          },
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        })
      })
    )

    await cacheInvalidate(`sprint-capacity:${id}`)

    return NextResponse.json(results)
  } catch (error) {
    console.error('Error updating capacity:', error)
    return NextResponse.json({ error: 'Failed to update capacity' }, { status: 500 })
  }
}
