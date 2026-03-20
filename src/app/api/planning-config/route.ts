import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { createAuditLog } from '@/lib/domain/audit'

const planningFieldSchema = z.object({
  fieldDefinitionId: z.string().trim().min(1),
  order: z.number().int().optional(),
  requiredOverride: z.boolean().nullable().optional(),
  isVisible: z.boolean().optional(),
  options: z.array(z.string().trim().min(1)).optional(),
})

const updatePlanningSchema = z.object({
  projectId: z.string().trim().min(1),
  workItemTypeId: z.string().trim().min(1),
  fields: z.array(planningFieldSchema),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const workItemTypeId = searchParams.get('workItemTypeId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const where: Record<string, unknown> = {
      projectId,
      groupKey: 'planning',
    }

    if (workItemTypeId) {
      where.workItemTypeId = workItemTypeId
    }

    const mappings = await db.workItemTypeFieldMapping.findMany({
      where,
      orderBy: [
        { workItemType: { order: 'asc' } },
        { order: 'asc' },
        { createdAt: 'asc' },
      ],
      include: {
        workItemType: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        },
        fieldDefinition: {
          select: {
            id: true,
            key: true,
            label: true,
            dataType: true,
            required: true,
            options: true,
          },
        },
      },
    })

    return NextResponse.json(mappings)
  } catch (error) {
    console.error('Error fetching planning configuration:', error)
    return NextResponse.json({ error: 'Failed to fetch planning configuration' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const data = updatePlanningSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'masterdata:manage')
    if (!auth.ok) return auth.response

    const typeDefinition = await db.workItemTypeDefinition.findUnique({
      where: { id: data.workItemTypeId },
      select: { id: true, key: true, projectId: true },
    })

    if (!typeDefinition || typeDefinition.projectId !== data.projectId) {
      return NextResponse.json({ error: 'Work item type not found' }, { status: 404 })
    }

    const fieldIds = Array.from(new Set(data.fields.map((field) => field.fieldDefinitionId)))
    const fields = await db.workItemFieldDefinition.findMany({
      where: {
        id: { in: fieldIds },
        projectId: data.projectId,
        workItemTypeId: data.workItemTypeId,
      },
      select: { id: true },
    })

    if (fields.length !== fieldIds.length) {
      return NextResponse.json(
        { error: 'Planning fields must belong to the selected work item type' },
        { status: 400 }
      )
    }

    await db.$transaction(async (tx) => {
      for (const [index, field] of data.fields.entries()) {
        await tx.workItemTypeFieldMapping.upsert({
          where: {
            workItemTypeId_fieldDefinitionId: {
              workItemTypeId: data.workItemTypeId,
              fieldDefinitionId: field.fieldDefinitionId,
            },
          },
          update: {
            groupKey: 'planning',
            order: field.order ?? index * 10,
            requiredOverride: field.requiredOverride ?? null,
            isVisible: field.isVisible ?? true,
          },
          create: {
            projectId: data.projectId,
            workItemTypeId: data.workItemTypeId,
            fieldDefinitionId: field.fieldDefinitionId,
            groupKey: 'planning',
            order: field.order ?? index * 10,
            requiredOverride: field.requiredOverride ?? null,
            isVisible: field.isVisible ?? true,
          },
        })

        if (field.options && field.options.length > 0) {
          await tx.workItemFieldDefinition.update({
            where: { id: field.fieldDefinitionId },
            data: {
              options: field.options,
            },
          })
        }
      }
    })

    await createAuditLog({
      projectId: data.projectId,
      userId: auth.actor.userId,
      action: 'planning_config_updated',
      details: {
        workItemTypeId: data.workItemTypeId,
        workItemTypeKey: typeDefinition.key,
        fieldCount: data.fields.length,
      },
    })

    await invalidateProjectCaches(data.projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error updating planning configuration:', error)
    return NextResponse.json({ error: 'Failed to update planning configuration' }, { status: 500 })
  }
}
