import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { normalizeProjectRole } from '@/lib/domain/rbac'

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

// GET /api/approvals?issueId=xxx or ?issueId=xxx&projectId=xxx or ?pending=true&projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const issueId = searchParams.get('issueId')
    let projectId = searchParams.get('projectId')
    const pending = searchParams.get('pending') === 'true'

    // Derive projectId from issueId when not provided
    if (!projectId && issueId) {
      const issue = await db.issue.findUnique({
        where: { id: issueId },
        select: { projectId: true },
      })
      if (!issue) {
        return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
      }
      projectId = issue.projectId
    }

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    const where: Record<string, unknown> = {}

    if (issueId) {
      where.issueId = issueId
    } else if (pending) {
      where.status = 'pending'
      where.issue = { projectId }
    }

    const approvals = await db.approvalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        issue: { select: { id: true, key: true, title: true } },
        decisions: {
          include: {
            approver: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    const approverIds = Array.from(
      new Set(approvals.flatMap((approval) => readStringArray(approval.approverUserIds)))
    )
    const approverUsers = approverIds.length
      ? await db.user.findMany({
          where: { id: { in: approverIds } },
          select: { id: true, name: true, email: true },
        })
      : []
    const approverMap = new Map(approverUsers.map((user) => [user.id, user]))

    // Map to the shape the frontend expects
    const mapped = approvals
      .map((a) => {
        const assignedApproverIds = readStringArray(a.approverUserIds)
        return {
          ...a,
          approverUserIds: assignedApproverIds,
          approvers: assignedApproverIds
            .map((id) => approverMap.get(id))
            .filter((value): value is { id: string; name: string; email: string } => Boolean(value)),
          requiredApprovals: a.requiredApprovals,
          approvalCount: a.decisions.filter((d) => d.decision === 'approved').length,
          rejectionCount: a.decisions.filter((d) => d.decision === 'rejected').length,
          canCurrentUserDecide:
            a.status === 'pending' &&
            a.requestedById !== auth.actor.userId &&
            assignedApproverIds.includes(auth.actor.userId),
          decisions: a.decisions.map((d) => ({
            ...d,
            userId: d.approverId,
            user: d.approver,
          })),
        }
      })
      .filter((approval) => {
        if (!pending) return true
        if (approval.approverUserIds.length === 0) return false
        return approval.approverUserIds.includes(auth.actor.userId)
      })

    return NextResponse.json(mapped)
  } catch (error) {
    console.error('Error fetching approvals:', error)
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 })
  }
}

const createApprovalSchema = z.object({
  issueId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  transitionId: z.string().trim().min(1).optional(),
  requiredApprovals: z.number().int().min(1).max(20).optional(),
  reason: z.string().trim().max(2000).optional(),
  approverUserIds: z.array(z.string().trim().min(1)).max(20).optional(),
})

// POST /api/approvals - Request approval
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createApprovalSchema.parse(body)

    // Resolve projectId from issue if not provided
    let projectId = data.projectId
    if (!projectId) {
      const issue = await db.issue.findUnique({
        where: { id: data.issueId },
        select: { projectId: true },
      })
      if (!issue) {
        return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
      }
      projectId = issue.projectId
    }

    const auth = await requireProjectPermission(request, projectId, 'workitem:update')
    if (!auth.ok) return auth.response

    // Verify issue exists in project
    const issue = await db.issue.findFirst({
      where: { id: data.issueId, projectId },
      select: { id: true, key: true, stateId: true },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    // Check for existing pending approval
    const existing = await db.approvalRequest.findFirst({
      where: { issueId: data.issueId, status: 'pending' },
    })

    if (existing) {
      return NextResponse.json({ error: 'An approval request is already pending' }, { status: 409 })
    }

    // Resolve transition info if provided
    let transitionId: string | null = null
    let fromStateId: string | null = null
    let toStateId: string | null = null
    let transitionApprovalRoles: string[] = []
    let transitionMinApprovals: number | null = null

    if (data.transitionId) {
      const transition = await db.stateTransition.findUnique({
        where: { id: data.transitionId },
        select: {
          id: true,
          isEnabled: true,
          fromStateId: true,
          toStateId: true,
          approverRoles: true,
          minApprovals: true,
        },
      })
      if (transition) {
        if (!transition.isEnabled) {
          return NextResponse.json({ error: 'Selected transition is disabled' }, { status: 400 })
        }

        if (issue.stateId !== transition.fromStateId) {
          return NextResponse.json(
            { error: 'Selected transition does not start from the current workflow state' },
            { status: 409 }
          )
        }

        transitionId = transition.id
        fromStateId = transition.fromStateId
        toStateId = transition.toStateId
        transitionApprovalRoles = readStringArray(transition.approverRoles)
        transitionMinApprovals = transition.minApprovals
      } else {
        return NextResponse.json({ error: 'Workflow transition not found' }, { status: 404 })
      }
    }

    const projectMembers = await db.projectMember.findMany({
      where: { projectId },
      select: { userId: true, role: true },
    })

    const candidateApproverIds = data.approverUserIds?.length
      ? Array.from(new Set(data.approverUserIds))
      : projectMembers
          .filter((member) => {
            if (member.userId === auth.actor.userId) return false
            if (transitionApprovalRoles.length > 0) {
              return transitionApprovalRoles.includes(normalizeProjectRole(member.role))
            }
            return ['Admin', 'PM', 'DevOps'].includes(normalizeProjectRole(member.role))
          })
          .map((member) => member.userId)

    const validApproverIds = candidateApproverIds.filter((userId) =>
      projectMembers.some((member) => member.userId === userId)
    )

    const assignedApproverIds = validApproverIds.filter((userId) => userId !== auth.actor.userId)

    if (assignedApproverIds.length === 0) {
      return NextResponse.json(
        { error: 'Approval requests require at least one assigned approver' },
        { status: 400 }
      )
    }

    const requiredApprovals = Math.min(
      data.requiredApprovals ?? transitionMinApprovals ?? 1,
      assignedApproverIds.length
    )

    const approval = await db.approvalRequest.create({
      data: {
        issueId: data.issueId,
        transitionId,
        requestedById: auth.actor.userId,
        fromStateId,
        toStateId,
        requiredApprovals,
        approverUserIds: assignedApproverIds,
        reason: data.reason || null,
      },
    })

    return NextResponse.json(approval, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating approval:', error)
    return NextResponse.json({ error: 'Failed to create approval' }, { status: 500 })
  }
}
