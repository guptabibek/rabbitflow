import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { createAuditLog } from '@/lib/domain/audit'
import { isFinalStateCategory, normalizeStateCategory } from '@/lib/domain/state-categories'
import { z } from 'zod'

const createStateSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  color: z.string(),
  category: z.string().trim().min(1).transform(normalizeStateCategory),
  isFinal: z.boolean().optional(),
  order: z.number().int().optional(),
  workItemTypeId: z.string().trim().min(1).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const states = await db.state.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: {
        _count: {
          select: {
            issues: true,
            workItemTypeMappings: true,
            outgoingTransitions: true,
            incomingTransitions: true,
          },
        },
      },
    })

    return NextResponse.json(states)
  } catch (error) {
    console.error('Error fetching states:', error)
    return NextResponse.json({ error: 'Failed to fetch states' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createStateSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'masterdata:manage')
    if (!auth.ok) return auth.response

    const lastState = await db.state.findFirst({
      where: { projectId: data.projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })

    if (data.workItemTypeId) {
      const workItemType = await db.workItemTypeDefinition.findUnique({
        where: { id: data.workItemTypeId },
        select: { id: true, projectId: true },
      })

      if (!workItemType || workItemType.projectId !== data.projectId) {
        return NextResponse.json(
          { error: 'Selected work item type does not belong to this project' },
          { status: 400 }
        )
      }
    }

    const state = await db.$transaction(async (tx) => {
      const createdState = await tx.state.create({
        data: {
          projectId: data.projectId,
          name: data.name,
          color: data.color,
          category: data.category,
          order: data.order ?? (lastState?.order || 0) + 10,
          isFinal: data.isFinal ?? isFinalStateCategory(data.category),
        },
      })

      if (data.workItemTypeId) {
        const lastMapping = await tx.workItemTypeStateMapping.findFirst({
          where: {
            projectId: data.projectId,
            workItemTypeId: data.workItemTypeId,
          },
          orderBy: [{ order: 'desc' }, { createdAt: 'desc' }],
          select: { order: true },
        })

        const mappingCount = await tx.workItemTypeStateMapping.count({
          where: {
            projectId: data.projectId,
            workItemTypeId: data.workItemTypeId,
          },
        })

        await tx.workItemTypeStateMapping.create({
          data: {
            projectId: data.projectId,
            workItemTypeId: data.workItemTypeId,
            stateId: createdState.id,
            order: (lastMapping?.order ?? -10) + 10,
            isInitial: mappingCount === 0,
          },
        })
      }

      return createdState
    })

    await createAuditLog({
      projectId: data.projectId,
      userId: auth.actor.userId,
      action: 'state_config_created',
      details: {
        stateId: state.id,
        name: state.name,
        workItemTypeId: data.workItemTypeId ?? null,
      },
    })

    await invalidateProjectCaches(data.projectId)

    return NextResponse.json(state, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }
    console.error('Error creating state:', error)
    return NextResponse.json({ error: 'Failed to create state' }, { status: 500 })
  }
}
