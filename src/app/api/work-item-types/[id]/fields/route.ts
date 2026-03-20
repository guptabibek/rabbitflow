import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { createAuditLog } from '@/lib/domain/audit'

const fieldMappingSchema = z.object({
  fieldDefinitionId: z.string().trim().min(1),
  sectionId: z.string().trim().min(1).nullable().optional(),
  groupKey: z.string().trim().min(1).max(64),
  order: z.number().int().optional(),
  requiredOverride: z.boolean().nullable().optional(),
  isVisible: z.boolean().optional(),
})

const updateFieldMappingsSchema = z.object({
  mappings: z.array(fieldMappingSchema),
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

    const mappings = await db.workItemTypeFieldMapping.findMany({
      where: {
        workItemTypeId: typeDefinition.id,
      },
      orderBy: [{ groupKey: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
      include: {
        fieldDefinition: {
          select: {
            id: true,
            key: true,
            label: true,
            dataType: true,
            required: true,
          },
        },
        section: {
          select: {
            id: true,
            key: true,
            title: true,
          },
        },
      },
    })

    return NextResponse.json({
      workItemType: typeDefinition,
      mappings,
    })
  } catch (error) {
    console.error('Error fetching work item field mappings:', error)
    return NextResponse.json({ error: 'Failed to fetch work item field mappings' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const data = updateFieldMappingsSchema.parse(body)

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

    const fieldIds = Array.from(new Set(data.mappings.map((mapping) => mapping.fieldDefinitionId)))

    const fields = await db.workItemFieldDefinition.findMany({
      where: {
        id: { in: fieldIds },
        projectId: typeDefinition.projectId,
        workItemTypeId: typeDefinition.id,
      },
      select: { id: true },
    })

    if (fields.length !== fieldIds.length) {
      return NextResponse.json(
        { error: 'All field mappings must reference fields from the same work item type' },
        { status: 400 }
      )
    }

    const sectionIds = Array.from(
      new Set(
        data.mappings
          .map((mapping) => mapping.sectionId)
          .filter((value): value is string => Boolean(value))
      )
    )

    if (sectionIds.length > 0) {
      const sections = await db.workItemSectionDefinition.findMany({
        where: {
          id: { in: sectionIds },
          projectId: typeDefinition.projectId,
          workItemTypeId: typeDefinition.id,
        },
        select: { id: true },
      })

      if (sections.length !== sectionIds.length) {
        return NextResponse.json(
          { error: 'Section mappings must reference sections from the same work item type' },
          { status: 400 }
        )
      }
    }

    await db.$transaction(async (tx) => {
      for (const [index, mapping] of data.mappings.entries()) {
        await tx.workItemTypeFieldMapping.upsert({
          where: {
            workItemTypeId_fieldDefinitionId: {
              workItemTypeId: typeDefinition.id,
              fieldDefinitionId: mapping.fieldDefinitionId,
            },
          },
          update: {
            projectId: typeDefinition.projectId,
            sectionId: mapping.sectionId ?? null,
            groupKey: mapping.groupKey,
            order: mapping.order ?? index * 10,
            requiredOverride: mapping.requiredOverride ?? null,
            isVisible: mapping.isVisible ?? true,
          },
          create: {
            projectId: typeDefinition.projectId,
            workItemTypeId: typeDefinition.id,
            fieldDefinitionId: mapping.fieldDefinitionId,
            sectionId: mapping.sectionId ?? null,
            groupKey: mapping.groupKey,
            order: mapping.order ?? index * 10,
            requiredOverride: mapping.requiredOverride ?? null,
            isVisible: mapping.isVisible ?? true,
          },
        })
      }
    })

    await createAuditLog({
      projectId: typeDefinition.projectId,
      userId: auth.actor.userId,
      action: 'field_mapping_config_updated',
      details: {
        workItemTypeId: typeDefinition.id,
        workItemTypeKey: typeDefinition.key,
        mappingCount: data.mappings.length,
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

    console.error('Error updating work item field mappings:', error)
    return NextResponse.json({ error: 'Failed to update work item field mappings' }, { status: 500 })
  }
}
