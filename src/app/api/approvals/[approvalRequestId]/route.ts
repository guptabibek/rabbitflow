import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(2000).optional(),
})

// POST /api/approvals/[approvalRequestId] - Submit a decision
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ approvalRequestId: string }> }
) {
  try {
    const { approvalRequestId: id } = await params
    const body = await request.json()
    const data = decisionSchema.parse(body)

    const approval = await db.approvalRequest.findUnique({
      where: { id },
      include: {
        issue: { select: { id: true, projectId: true } },
        decisions: true,
      },
    })

    if (!approval) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 })
    }

    if (approval.status !== 'pending') {
      return NextResponse.json({ error: 'Approval is no longer pending' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, approval.issue.projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    const assignedApproverIds = readStringArray(approval.approverUserIds)
    if (!assignedApproverIds.includes(auth.actor.userId)) {
      return NextResponse.json({ error: 'You are not an assigned approver for this request' }, { status: 403 })
    }

    // Prevent self-approval
    if (approval.requestedById === auth.actor.userId) {
      return NextResponse.json({ error: 'Cannot approve your own request' }, { status: 403 })
    }

    // Check if already voted
    const alreadyDecided = approval.decisions.some((d) => d.approverId === auth.actor.userId)
    if (alreadyDecided) {
      return NextResponse.json({ error: 'You have already submitted a decision' }, { status: 409 })
    }

    // Create decision
    const decision = await db.approvalDecision.create({
      data: {
        requestId: id,
        approverId: auth.actor.userId,
        decision: data.decision,
        comment: data.comment ?? null,
      },
    })

    // Check if approval threshold is met
    if (data.decision === 'rejected') {
      await db.approvalRequest.update({
        where: { id },
        data: { status: 'rejected', resolvedAt: new Date() },
      })
    } else {
      const approvalCount = approval.decisions.filter((d) => d.decision === 'approved').length + 1
      if (approvalCount >= approval.requiredApprovals) {
        await db.approvalRequest.update({
          where: { id },
          data: { status: 'approved', resolvedAt: new Date() },
        })
      }
    }

    return NextResponse.json(decision, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error submitting decision:', error)
    return NextResponse.json({ error: 'Failed to submit decision' }, { status: 500 })
  }
}

// GET /api/approvals/[approvalRequestId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ approvalRequestId: string }> }
) {
  try {
    const { approvalRequestId: id } = await params

    const approval = await db.approvalRequest.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        issue: { select: { id: true, key: true, title: true, projectId: true } },
        decisions: {
          include: { approver: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, approval.issue.projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    const assignedApproverIds = readStringArray(approval.approverUserIds)
    const approverUsers = assignedApproverIds.length
      ? await db.user.findMany({
          where: { id: { in: assignedApproverIds } },
          select: { id: true, name: true, email: true },
        })
      : []
    const approverMap = new Map(approverUsers.map((user) => [user.id, user]))

    // Map to frontend shape
    const mapped = {
      ...approval,
      approverUserIds: assignedApproverIds,
      approvers: assignedApproverIds
        .map((userId) => approverMap.get(userId))
        .filter((value): value is { id: string; name: string; email: string } => Boolean(value)),
      canCurrentUserDecide:
        approval.status === 'pending' &&
        approval.requestedById !== auth.actor.userId &&
        assignedApproverIds.includes(auth.actor.userId),
      approvalCount: approval.decisions.filter((d) => d.decision === 'approved').length,
      rejectionCount: approval.decisions.filter((d) => d.decision === 'rejected').length,
      decisions: approval.decisions.map((d) => ({
        ...d,
        userId: d.approverId,
        user: d.approver,
      })),
    }

    return NextResponse.json(mapped)
  } catch (error) {
    console.error('Error fetching approval:', error)
    return NextResponse.json({ error: 'Failed to fetch approval' }, { status: 500 })
  }
}
