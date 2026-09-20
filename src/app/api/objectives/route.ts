import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const createObjectiveSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  startDate: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
})

const createKeyResultSchema = z.object({
  objectiveId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(500),
  targetValue: z.number().min(0),
  currentValue: z.number().min(0).optional(),
  unit: z.string().max(50).optional(),
  issueId: z.string().trim().min(1).nullable().optional(),
  issueIds: z.array(z.string().trim().min(1)).max(1).optional(),
})

// GET /api/objectives?projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const objectives = await db.objective.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        keyResults: {
          orderBy: { createdAt: 'asc' },
          include: {
            issue: {
              select: {
                id: true,
                key: true,
                title: true,
                status: true,
                priority: true,
                dueDate: true,
                startDate: true,
                assignee: { select: { id: true, name: true } },
                sourceRelations: {
                  where: { relationType: 'blocked_by' },
                  select: { targetIssue: { select: { id: true, key: true, title: true, status: true } } },
                },
                targetRelations: {
                  where: { relationType: 'blocks' },
                  select: { sourceIssue: { select: { id: true, key: true, title: true, status: true } } },
                },
              },
            },
          },
        },
        owner: { select: { id: true, name: true } },
        _count: { select: { keyResults: true } },
      },
    })

    // Calculate progress for each objective
    const now = new Date()
    const withProgress = objectives.map((obj) => {
      const totalKRs = obj.keyResults.length
      const totalProgress = obj.keyResults.reduce((sum, kr) => {
        if (kr.targetValue === 0) return sum
        return sum + Math.min(1, kr.currentValue / kr.targetValue)
      }, 0)
      const keyResults = obj.keyResults.map((kr) => {
        if (!kr.issue) return { ...kr, issue: null }
        const blockers = [
          ...kr.issue.sourceRelations.map((relation) => relation.targetIssue),
          ...kr.issue.targetRelations.map((relation) => relation.sourceIssue),
        ].filter((issue) => !['done', 'cancelled'].includes(issue.status))
        const { sourceRelations: _sourceRelations, targetRelations: _targetRelations, ...issue } = kr.issue
        return {
          ...kr,
          issue: {
            ...issue,
            blockers,
            isOverdue: Boolean(issue.dueDate && issue.dueDate < now && !['done', 'cancelled'].includes(issue.status)),
          },
        }
      })
      const linkedIssues = keyResults.flatMap((kr) => kr.issue ? [kr.issue] : [])
      const overdueCount = linkedIssues.filter((issue) => issue.isOverdue).length
      const blockedCount = linkedIssues.filter((issue) => issue.blockers.length > 0).length
      const confidence = linkedIssues.length === 0
        ? { state: 'no_data', label: 'No linked delivery scope' }
        : overdueCount > 0
          ? { state: 'at_risk', label: 'At risk' }
          : blockedCount > 0
            ? { state: 'watch', label: 'Needs attention' }
            : { state: 'on_track', label: 'On track' }

      return {
        ...obj,
        keyResults,
        progress: totalKRs === 0 ? 0 : Math.round((totalProgress / totalKRs) * 100),
        progressSource: totalKRs === 0 ? 'No key results' : `Mean progress across ${totalKRs} key result${totalKRs === 1 ? '' : 's'}`,
        delivery: { linkedCount: linkedIssues.length, overdueCount, blockedCount, confidence },
      }
    })

    return NextResponse.json(withProgress)
  } catch (error) {
    console.error('Error fetching objectives:', error)
    return NextResponse.json({ error: 'Failed to fetch objectives' }, { status: 500 })
  }
}

// POST /api/objectives
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Handle both objective and key result creation
    if (body.objectiveId) {
      const data = createKeyResultSchema.parse(body)

      const objective = await db.objective.findUnique({
        where: { id: data.objectiveId },
        select: { id: true, projectId: true },
      })

      if (!objective) {
        return NextResponse.json({ error: 'Objective not found' }, { status: 404 })
      }

      const auth = await requireProjectPermission(request, objective.projectId, 'project:update')
      if (!auth.ok) return auth.response

      const issueId = data.issueId ?? data.issueIds?.[0] ?? null
      if (issueId) {
        const linkedIssue = await db.issue.findFirst({
          where: { id: issueId, projectId: objective.projectId },
          select: { id: true },
        })
        if (!linkedIssue) {
          return NextResponse.json({ error: 'Linked work item must belong to the objective project' }, { status: 400 })
        }
      }

      const kr = await db.keyResult.create({
        data: {
          objectiveId: data.objectiveId,
          title: data.title,
          targetValue: data.targetValue,
          currentValue: data.currentValue ?? 0,
          unit: data.unit ?? '%',
          issueId,
        },
      })

      return NextResponse.json(kr, { status: 201 })
    }

    const data = createObjectiveSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'project:update')
    if (!auth.ok) return auth.response

    const startDate = data.startDate ? new Date(data.startDate) : null
    const endDate = data.endDate ? new Date(data.endDate) : null

    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      return NextResponse.json(
        { error: 'Objective end date cannot be earlier than the start date' },
        { status: 400 }
      )
    }

    if (data.parentId) {
      const parentObjective = await db.objective.findUnique({
        where: { id: data.parentId },
        select: { id: true, projectId: true },
      })

      if (!parentObjective || parentObjective.projectId !== data.projectId) {
        return NextResponse.json(
          { error: 'Parent objective must belong to the selected project' },
          { status: 400 }
        )
      }
    }

    const objective = await db.objective.create({
      data: {
        projectId: data.projectId,
        ownerId: auth.actor.userId,
        title: data.title,
        description: data.description ?? null,
        startDate,
        endDate,
        parentId: data.parentId ?? null,
      },
    })

    return NextResponse.json(objective, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating OKR:', error)
    return NextResponse.json({ error: 'Failed to create OKR' }, { status: 500 })
  }
}
