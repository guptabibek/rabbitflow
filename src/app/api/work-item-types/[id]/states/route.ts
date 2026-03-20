import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { createAuditLog } from '@/lib/domain/audit'

const mappingSchema = z.object({
  stateId: z.string().trim().min(1),
  order: z.number().int().optional(),
  isInitial: z.boolean().optional(),
})

const transitionSchema = z.object({
  fromStateId: z.string().trim().min(1),
  toStateId: z.string().trim().min(1),
  order: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
})

const updateTypeStateConfigSchema = z.object({
  stateMappings: z.array(mappingSchema).min(1),
  transitions: z.array(transitionSchema),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const typeDefinition = await db.workItemTypeDefinition.findUnique({
      where: { id },
      select: {
        id: true,
        key: true,
        name: true,
        projectId: true,
      },
    })

    if (!typeDefinition) {
      return NextResponse.json({ error: 'Work item type not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, typeDefinition.projectId, 'project:read')
    if (!auth.ok) return auth.response

    const [mappings, transitions] = await Promise.all([
      db.workItemTypeStateMapping.findMany({
        where: {
          workItemTypeId: typeDefinition.id,
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: {
          state: {
            select: {
              id: true,
              name: true,
              color: true,
              category: true,
              isFinal: true,
              order: true,
            },
          },
        },
      }),
      db.stateTransition.findMany({
        where: {
          workItemTypeId: typeDefinition.id,
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          fromStateId: true,
          toStateId: true,
          order: true,
          isEnabled: true,
        },
      }),
    ])

    return NextResponse.json({
      workItemType: typeDefinition,
      mappings,
      transitions,
    })
  } catch (error) {
    console.error('Error fetching work item state configuration:', error)
    return NextResponse.json(
      { error: 'Failed to fetch work item state configuration' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const data = updateTypeStateConfigSchema.parse(body)

    const typeDefinition = await db.workItemTypeDefinition.findUnique({
      where: { id },
      select: {
        id: true,
        key: true,
        projectId: true,
      },
    })

    if (!typeDefinition) {
      return NextResponse.json({ error: 'Work item type not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      typeDefinition.projectId,
      'masterdata:manage'
    )
    if (!auth.ok) return auth.response

    const distinctStateIds = Array.from(
      new Set(data.stateMappings.map((mapping) => mapping.stateId))
    )

    const states = await db.state.findMany({
      where: {
        projectId: typeDefinition.projectId,
        id: { in: distinctStateIds },
      },
      select: { id: true },
    })

    if (states.length !== distinctStateIds.length) {
      return NextResponse.json(
        { error: 'All mapped states must belong to the same project' },
        { status: 400 }
      )
    }

    const currentMappings = await db.workItemTypeStateMapping.findMany({
      where: { workItemTypeId: typeDefinition.id },
      select: { id: true, stateId: true },
    })

    const currentStateIds = new Set(currentMappings.map((mapping) => mapping.stateId))
    const nextStateIds = new Set(distinctStateIds)
    const removedStateIds = Array.from(currentStateIds).filter(
      (stateId) => !nextStateIds.has(stateId)
    )

    if (removedStateIds.length > 0) {
      const usedCount = await db.issue.count({
        where: {
          projectId: typeDefinition.projectId,
          workItemType: typeDefinition.key,
          stateId: { in: removedStateIds },
        },
      })

      if (usedCount > 0) {
        return NextResponse.json(
          {
            error:
              'Cannot remove mapped states that are still used by existing work items of this type',
          },
          { status: 409 }
        )
      }
    }

    const normalizedMappings = data.stateMappings.map((mapping, index) => ({
      stateId: mapping.stateId,
      order: mapping.order ?? index * 10,
      isInitial: mapping.isInitial ?? false,
    }))

    if (!normalizedMappings.some((mapping) => mapping.isInitial)) {
      normalizedMappings[0].isInitial = true
    }

    const initialMapping = normalizedMappings.find((mapping) => mapping.isInitial)
    if (initialMapping) {
      for (const mapping of normalizedMappings) {
        if (mapping.stateId !== initialMapping.stateId) {
          mapping.isInitial = false
        }
      }
    }

    const transitionStateIds = new Set(normalizedMappings.map((mapping) => mapping.stateId))
    for (const transition of data.transitions) {
      if (
        !transitionStateIds.has(transition.fromStateId) ||
        !transitionStateIds.has(transition.toStateId)
      ) {
        return NextResponse.json(
          {
            error:
              'Transitions can only reference states already mapped to this work item type',
          },
          { status: 400 }
        )
      }
    }

    await db.$transaction(async (tx) => {
      for (const mapping of normalizedMappings) {
        await tx.workItemTypeStateMapping.upsert({
          where: {
            workItemTypeId_stateId: {
              workItemTypeId: typeDefinition.id,
              stateId: mapping.stateId,
            },
          },
          update: {
            projectId: typeDefinition.projectId,
            order: mapping.order,
            isInitial: mapping.isInitial,
          },
          create: {
            projectId: typeDefinition.projectId,
            workItemTypeId: typeDefinition.id,
            stateId: mapping.stateId,
            order: mapping.order,
            isInitial: mapping.isInitial,
          },
        })
      }

      if (removedStateIds.length > 0) {
        await tx.workItemTypeStateMapping.deleteMany({
          where: {
            workItemTypeId: typeDefinition.id,
            stateId: { in: removedStateIds },
          },
        })
      }

      await tx.stateTransition.deleteMany({
        where: {
          workItemTypeId: typeDefinition.id,
        },
      })

      if (data.transitions.length > 0) {
        await tx.stateTransition.createMany({
          data: data.transitions.map((transition, index) => ({
            projectId: typeDefinition.projectId,
            workItemTypeId: typeDefinition.id,
            fromStateId: transition.fromStateId,
            toStateId: transition.toStateId,
            order: transition.order ?? index * 10,
            isEnabled: transition.isEnabled ?? true,
          })),
          skipDuplicates: true,
        })
      }
    })

    await createAuditLog({
      projectId: typeDefinition.projectId,
      userId: auth.actor.userId,
      action: 'state_machine_config_updated',
      details: {
        workItemTypeId: typeDefinition.id,
        workItemTypeKey: typeDefinition.key,
        mappedStateCount: normalizedMappings.length,
        transitionCount: data.transitions.length,
      },
    })

    await invalidateProjectCaches(typeDefinition.projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error updating work item state configuration:', error)
    return NextResponse.json(
      { error: 'Failed to update work item state configuration' },
      { status: 500 }
    )
  }
}
