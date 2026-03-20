import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createAuditLog } from '@/lib/domain/audit'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateSprintCaches } from '@/lib/domain/cache'

const relationTypeSchema = z.enum([
  'related',
  'blocked_by',
  'blocks',
  'duplicate_of',
  'tests',
  'tested_by',
])

const createRelationSchema = z.object({
  sourceIssueId: z.string(),
  targetIssueId: z.string(),
  relationType: relationTypeSchema,
})

const deleteRelationSchema = z.object({
  sourceIssueId: z.string(),
  targetIssueId: z.string(),
  relationType: relationTypeSchema,
})

function getInverseRelationType(relationType: z.infer<typeof relationTypeSchema>) {
  const inverseMap: Record<z.infer<typeof relationTypeSchema>, z.infer<typeof relationTypeSchema>> = {
    related: 'related',
    blocked_by: 'blocks',
    blocks: 'blocked_by',
    duplicate_of: 'duplicate_of',
    tests: 'tested_by',
    tested_by: 'tests',
  }

  return inverseMap[relationType]
}

async function invalidateRelationCaches(
  projectId: string,
  iterationIds: Array<string | null | undefined>
) {
  await Promise.all(
    Array.from(new Set(iterationIds.map((iterationId) => iterationId ?? null))).map((iterationId) =>
      invalidateSprintCaches(projectId, iterationId)
    )
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const issueId = searchParams.get('issueId')
    const projectId = searchParams.get('projectId')
    const cursor = searchParams.get('cursor')
    const takeParam = parseInt(searchParams.get('take') || '0', 10)
    const paginate = searchParams.get('paginate') === 'true' || takeParam > 0
    const take = Math.min(Math.max(takeParam || 30, 1), 100)
    const flat = searchParams.get('flat') === 'true'

    if (!issueId && !projectId) {
      return NextResponse.json({ error: 'issueId or projectId is required' }, { status: 400 })
    }

    if (projectId) {
      const auth = await requireProjectPermission(request, projectId, 'workitem:read')
      if (!auth.ok) return auth.response
    }

    if (issueId) {
      const issue = await db.issue.findUnique({
        where: { id: issueId },
        select: { projectId: true },
      })

      if (!issue) {
        return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
      }

      const auth = await requireProjectPermission(request, issue.projectId, 'workitem:read')
      if (!auth.ok) return auth.response
    }

    const where = issueId
      ? {
          relationType: { in: relationTypeSchema.options },
          OR: [{ sourceIssueId: issueId }, { targetIssueId: issueId }],
        }
      : {
          relationType: { in: relationTypeSchema.options },
          OR: [
            { sourceIssue: { projectId: projectId! } },
            { targetIssue: { projectId: projectId! } },
          ],
        }

    const include = {
      sourceIssue: {
        select: { id: true, key: true, title: true, status: true, workItemType: true },
      },
      targetIssue: {
        select: { id: true, key: true, title: true, status: true, workItemType: true },
      },
    }

    if (paginate) {
      const rows = await db.issueRelation.findMany({
        where,
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include,
        orderBy: { id: 'desc' },
      })

      const hasMore = rows.length > take
      const items = hasMore ? rows.slice(0, take) : rows
      const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null

      if (flat && issueId) {
        return NextResponse.json({
          items: items.map((relation) => {
            const isOutgoing = relation.sourceIssueId === issueId
            const normalizedRelationType = isOutgoing
              ? relation.relationType
              : getInverseRelationType(relation.relationType as z.infer<typeof relationTypeSchema>)

            return {
              id: relation.id,
              relationType: normalizedRelationType,
              direction: isOutgoing ? 'outgoing' : 'incoming',
              sourceIssueId: relation.sourceIssueId,
              targetIssueId: relation.targetIssueId,
              createdAt: relation.createdAt,
              linkedIssue: isOutgoing ? relation.targetIssue : relation.sourceIssue,
            }
          }),
          nextCursor,
          hasMore,
        })
      }

      return NextResponse.json({ items, nextCursor, hasMore })
    }

    const relations = await db.issueRelation.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    })

    if (flat && issueId) {
      return NextResponse.json(
        relations.map((relation) => {
          const isOutgoing = relation.sourceIssueId === issueId
          return {
            id: relation.id,
            relationType: isOutgoing
              ? relation.relationType
              : getInverseRelationType(relation.relationType as z.infer<typeof relationTypeSchema>),
            direction: isOutgoing ? 'outgoing' : 'incoming',
            sourceIssueId: relation.sourceIssueId,
            targetIssueId: relation.targetIssueId,
            createdAt: relation.createdAt,
            linkedIssue: isOutgoing ? relation.targetIssue : relation.sourceIssue,
          }
        })
      )
    }

    return NextResponse.json(relations)
  } catch (error) {
    console.error('Error fetching relations:', error)
    return NextResponse.json({ error: 'Failed to fetch relations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createRelationSchema.parse(body)

    if (data.sourceIssueId === data.targetIssueId) {
      return NextResponse.json(
        { error: 'A work item cannot be linked to itself' },
        { status: 400 }
      )
    }

    const [sourceIssue, targetIssue] = await Promise.all([
      db.issue.findUnique({
        where: { id: data.sourceIssueId },
        select: {
          id: true,
          key: true,
          projectId: true,
          iterationId: true,
        },
      }),
      db.issue.findUnique({
        where: { id: data.targetIssueId },
        select: {
          id: true,
          key: true,
          projectId: true,
          iterationId: true,
        },
      }),
    ])

    if (!sourceIssue || !targetIssue) {
      return NextResponse.json({ error: 'One or both work items were not found' }, { status: 404 })
    }

    if (sourceIssue.projectId !== targetIssue.projectId) {
      return NextResponse.json(
        { error: 'Cross-project links are not allowed' },
        { status: 400 }
      )
    }

    const auth = await requireProjectPermission(request, sourceIssue.projectId, 'workitem:link')
    if (!auth.ok) return auth.response

    const inverseRelationType = getInverseRelationType(data.relationType)
    const existing = await db.issueRelation.findFirst({
      where: {
        OR: [
          {
            sourceIssueId: data.sourceIssueId,
            targetIssueId: data.targetIssueId,
            relationType: data.relationType,
          },
          {
            sourceIssueId: data.targetIssueId,
            targetIssueId: data.sourceIssueId,
            relationType: inverseRelationType,
          },
        ],
      },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json({ error: 'Link already exists' }, { status: 409 })
    }

    const relation = await db.issueRelation.create({
      data,
      include: {
        sourceIssue: {
          select: { id: true, key: true, title: true, status: true, workItemType: true },
        },
        targetIssue: {
          select: { id: true, key: true, title: true, status: true, workItemType: true },
        },
      },
    })

    await createAuditLog({
      projectId: sourceIssue.projectId,
      issueId: sourceIssue.id,
      userId: auth.actor.userId,
      action: 'work_item_linked',
      details: {
        sourceIssueKey: sourceIssue.key,
        targetIssueKey: targetIssue.key,
        relationType: data.relationType,
      },
    })

    await invalidateRelationCaches(sourceIssue.projectId, [
      sourceIssue.iterationId,
      targetIssue.iterationId,
    ])

    return NextResponse.json(relation, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }

    console.error('Error creating relation:', error)
    return NextResponse.json({ error: 'Failed to create relation' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const relationId = searchParams.get('id')

    if (relationId) {
      const relation = await db.issueRelation.findUnique({
        where: { id: relationId },
        include: {
          sourceIssue: {
            select: { id: true, key: true, projectId: true, iterationId: true },
          },
          targetIssue: {
            select: { id: true, key: true, iterationId: true },
          },
        },
      })

      if (!relation) {
        return NextResponse.json({ error: 'Link not found' }, { status: 404 })
      }

      const auth = await requireProjectPermission(
        request,
        relation.sourceIssue.projectId,
        'workitem:link'
      )
      if (!auth.ok) return auth.response

      await db.issueRelation.delete({ where: { id: relationId } })

      await createAuditLog({
        projectId: relation.sourceIssue.projectId,
        issueId: relation.sourceIssue.id,
        userId: auth.actor.userId,
        action: 'work_item_unlinked',
        details: {
          sourceIssueKey: relation.sourceIssue.key,
          targetIssueKey: relation.targetIssue.key,
          relationType: relation.relationType,
        },
      })

      await invalidateRelationCaches(relation.sourceIssue.projectId, [
        relation.sourceIssue.iterationId,
        relation.targetIssue.iterationId,
      ])

      return NextResponse.json({ success: true })
    }

    const parsed = deleteRelationSchema.safeParse({
      sourceIssueId: searchParams.get('sourceIssueId'),
      targetIssueId: searchParams.get('targetIssueId'),
      relationType: searchParams.get('relationType'),
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'id or (sourceIssueId, targetIssueId, relationType) are required' },
        { status: 400 }
      )
    }

    const relation = await db.issueRelation.findUnique({
      where: {
        sourceIssueId_targetIssueId_relationType: {
          sourceIssueId: parsed.data.sourceIssueId,
          targetIssueId: parsed.data.targetIssueId,
          relationType: parsed.data.relationType,
        },
      },
      include: {
        sourceIssue: {
          select: { id: true, key: true, projectId: true, iterationId: true },
        },
        targetIssue: {
          select: { id: true, key: true, iterationId: true },
        },
      },
    })

    if (!relation) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      relation.sourceIssue.projectId,
      'workitem:link'
    )
    if (!auth.ok) return auth.response

    await db.issueRelation.delete({
      where: {
        sourceIssueId_targetIssueId_relationType: {
          sourceIssueId: parsed.data.sourceIssueId,
          targetIssueId: parsed.data.targetIssueId,
          relationType: parsed.data.relationType,
        },
      },
    })

    await createAuditLog({
      projectId: relation.sourceIssue.projectId,
      issueId: relation.sourceIssue.id,
      userId: auth.actor.userId,
      action: 'work_item_unlinked',
      details: {
        sourceIssueKey: relation.sourceIssue.key,
        targetIssueKey: relation.targetIssue.key,
        relationType: relation.relationType,
      },
    })

    await invalidateRelationCaches(relation.sourceIssue.projectId, [
      relation.sourceIssue.iterationId,
      relation.targetIssue.iterationId,
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting relation:', error)
    return NextResponse.json({ error: 'Failed to delete relation' }, { status: 500 })
  }
}
