import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { invalidateProjectPermissionRuleCache } from '@/lib/domain/access-control'
import { requireProjectPermission } from '@/lib/domain/auth'
import { ALL_PERMISSIONS } from '@/lib/domain/rbac'

const permissionRuleSchema = z.object({
  projectId: z.string().trim().min(1),
  areaId: z.string().trim().min(1).nullable().optional(),
  role: z.enum(['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer']),
  permission: z.enum(ALL_PERMISSIONS),
  effect: z.enum(['allow', 'deny']).default('allow'),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'acl:manage')
    if (!auth.ok) return auth.response

    const [rules, areas] = await Promise.all([
      db.projectPermissionRule.findMany({
        where: { projectId },
        orderBy: [{ areaId: 'asc' }, { role: 'asc' }, { permission: 'asc' }],
      }),
      db.area.findMany({ where: { projectId }, orderBy: [{ path: 'asc' }, { name: 'asc' }] }),
    ])

    return NextResponse.json({ rules, areas, permissions: ALL_PERMISSIONS })
  } catch (error) {
    console.error('Error fetching ACL rules:', error)
    return NextResponse.json({ error: 'Failed to fetch ACL rules' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = permissionRuleSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'acl:manage')
    if (!auth.ok) return auth.response

    if (data.areaId) {
      const area = await db.area.findFirst({
        where: { id: data.areaId, projectId: data.projectId },
        select: { id: true },
      })

      if (!area) {
        return NextResponse.json({ error: 'Area not found in project' }, { status: 404 })
      }
    }

    const existing = await db.projectPermissionRule.findFirst({
      where: {
        projectId: data.projectId,
        areaId: data.areaId ?? null,
        role: data.role,
        permission: data.permission,
      },
      select: { id: true },
    })

    const rule = existing
      ? await db.projectPermissionRule.update({
          where: { id: existing.id },
          data: { effect: data.effect },
        })
      : await db.projectPermissionRule.create({
          data: {
            projectId: data.projectId,
            areaId: data.areaId ?? null,
            role: data.role,
            permission: data.permission,
            effect: data.effect,
          },
        })

    await invalidateProjectPermissionRuleCache(data.projectId)

    return NextResponse.json(rule, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid rule payload', details: error.issues }, { status: 400 })
    }
    console.error('Error creating ACL rule:', error)
    return NextResponse.json({ error: 'Failed to save ACL rule' }, { status: 500 })
  }
}