import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { saveWorkItemTypeDefinition } from '@/lib/domain/work-item-schema'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { createAuditLog } from '@/lib/domain/audit'

const fieldSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  description: z.string().nullable().optional(),
  dataType: z.enum([
    'text',
    'markdown',
    'number',
    'date',
    'boolean',
    'dropdown',
    'single_select',
    'multi_select',
    'user',
    'iteration',
    'area',
    'team',
  ]),
  required: z.boolean().optional(),
  placeholder: z.string().nullable().optional(),
  options: z.array(z.string()).optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
})

const sectionSchema = z.object({
  key: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  description: z.string().nullable().optional(),
  sectionType: z.enum(['fields', 'markdown', 'system']).optional(),
  isCollapsible: z.boolean().optional(),
  fields: z.array(fieldSchema),
})

const updateTypeSchema = z.object({
  key: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  hierarchyLevel: z.number().int().min(1).max(10).optional(),
  isEnabled: z.boolean().optional(),
  sections: z.array(sectionSchema),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const typeDefinition = await db.workItemTypeDefinition.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            fields: {
              orderBy: { order: 'asc' },
            },
          },
        },
        fields: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { issues: true },
        },
      },
    })

    if (!typeDefinition) {
      return NextResponse.json({ error: 'Work item type not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, typeDefinition.projectId, 'project:read')
    if (!auth.ok) return auth.response

    return NextResponse.json(typeDefinition)
  } catch (error) {
    console.error('Error fetching work item type:', error)
    return NextResponse.json({ error: 'Failed to fetch work item type' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const data = updateTypeSchema.parse(body)

    const existing = await db.workItemTypeDefinition.findUnique({
      where: { id },
      select: { id: true, projectId: true, isSystem: true, key: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Work item type not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'masterdata:manage')
    if (!auth.ok) return auth.response

    if (existing.isSystem && data.key !== existing.key) {
      return NextResponse.json(
        { error: 'System work item type keys cannot be changed' },
        { status: 400 }
      )
    }

    const definition = await saveWorkItemTypeDefinition(existing.projectId, data, id)

    await createAuditLog({
      projectId: existing.projectId,
      userId: auth.actor.userId,
      action: 'work_item_type_config_updated',
      details: {
        workItemTypeId: existing.id,
        key: data.key,
        name: data.name,
      },
    })

    await invalidateProjectCaches(existing.projectId)

    return NextResponse.json(definition)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0]
      const issuePath = firstIssue?.path?.join('.')
      return NextResponse.json(
        {
          error: issuePath
            ? `${issuePath}: ${firstIssue.message}`
            : firstIssue?.message || 'Validation failed',
        },
        { status: 400 }
      )
    }

    console.error('Error updating work item type:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update work item type' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.workItemTypeDefinition.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        isSystem: true,
        _count: {
          select: { issues: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Work item type not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'masterdata:manage')
    if (!auth.ok) return auth.response

    if (existing.isSystem) {
      return NextResponse.json(
        { error: 'System work item types cannot be deleted' },
        { status: 409 }
      )
    }

    if (existing._count.issues > 0) {
      return NextResponse.json(
        {
          error:
            'This work item type is already used by existing items. Reassign those items before deletion.',
        },
        { status: 409 }
      )
    }

    await db.workItemTypeDefinition.delete({ where: { id } })

    await createAuditLog({
      projectId: existing.projectId,
      userId: auth.actor.userId,
      action: 'work_item_type_config_deleted',
      details: {
        workItemTypeId: existing.id,
      },
    })

    await invalidateProjectCaches(existing.projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting work item type:', error)
    return NextResponse.json({ error: 'Failed to delete work item type' }, { status: 500 })
  }
}
