import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectPermission } from '@/lib/domain/auth'
import { ensureProjectSystemRecords } from '@/lib/domain/project-bootstrap'
import { createAuditLog } from '@/lib/domain/audit'
import {
  getProjectWorkItemTypes,
  saveWorkItemTypeDefinition,
} from '@/lib/domain/work-item-schema'
import { invalidateProjectCaches } from '@/lib/domain/cache'

const fieldSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
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
  key: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  description: z.string().nullable().optional(),
  sectionType: z.enum(['fields', 'markdown', 'system']).optional(),
  isCollapsible: z.boolean().optional(),
  fields: z.array(fieldSchema),
})

const createTypeSchema = z.object({
  projectId: z.string(),
  key: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  hierarchyLevel: z.number().int().min(1).max(10).optional(),
  isEnabled: z.boolean().optional(),
  sections: z.array(sectionSchema),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const includeDisabled = searchParams.get('includeDisabled') === 'true'

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    await ensureProjectSystemRecords(projectId, auth.actor.userId)

    return NextResponse.json(
      await getProjectWorkItemTypes(projectId, { includeDisabled })
    )
  } catch (error) {
    console.error('Error fetching work item types:', error)
    return NextResponse.json({ error: 'Failed to fetch work item types' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createTypeSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'masterdata:manage')
    if (!auth.ok) return auth.response

    const definition = await saveWorkItemTypeDefinition(data.projectId, data)

    await createAuditLog({
      projectId: data.projectId,
      userId: auth.actor.userId,
      action: 'work_item_type_config_created',
      details: {
        workItemTypeId: definition?.id,
        key: data.key,
        name: data.name,
      },
    })

    await invalidateProjectCaches(data.projectId)

    return NextResponse.json(definition, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error creating work item type:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create work item type' },
      { status: 500 }
    )
  }
}
