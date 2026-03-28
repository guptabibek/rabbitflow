import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { invalidateProjectPermissionRuleCache } from '@/lib/domain/access-control'
import { requireProjectPermission } from '@/lib/domain/auth'

const updateSchema = z.object({
  effect: z.enum(['allow', 'deny']),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const { ruleId: id } = await params
    const existing = await db.projectPermissionRule.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'acl:manage')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateSchema.parse(body)

    const updated = await db.projectPermissionRule.update({
      where: { id },
      data: { effect: data.effect },
    })

    await invalidateProjectPermissionRuleCache(existing.projectId)

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid rule update', details: error.issues }, { status: 400 })
    }
    console.error('Error updating ACL rule:', error)
    return NextResponse.json({ error: 'Failed to update ACL rule' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const { ruleId: id } = await params
    const existing = await db.projectPermissionRule.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'acl:manage')
    if (!auth.ok) return auth.response

    await db.projectPermissionRule.delete({ where: { id } })
    await invalidateProjectPermissionRuleCache(existing.projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting ACL rule:', error)
    return NextResponse.json({ error: 'Failed to delete ACL rule' }, { status: 500 })
  }
}