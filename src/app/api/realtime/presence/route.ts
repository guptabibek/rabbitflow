import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuthenticatedUser, requireProjectPermission } from '@/lib/domain/auth'
import { listProjectPresence, touchProjectPresence } from '@/lib/domain/collaboration'

const heartbeatSchema = z.object({
  projectId: z.string().trim().min(1),
  view: z.string().trim().max(80).nullable().optional(),
  issueId: z.string().trim().min(1).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'collaboration:read', undefined, {
      allowScoped: true,
    })
    if (!auth.ok) return auth.response

    const presence = await listProjectPresence(projectId)
    return NextResponse.json({ presence })
  } catch (error) {
    console.error('Error fetching collaboration presence:', error)
    return NextResponse.json({ error: 'Failed to fetch presence' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = heartbeatSchema.parse(body)
    const user = await requireAuthenticatedUser(request)
    if (!user.ok) return user.response
    const auth = await requireProjectPermission(request, data.projectId, 'collaboration:read', undefined, {
      allowScoped: true,
    })
    if (!auth.ok) return auth.response

    const profile = await db.user.findUnique({
      where: { id: user.user.id },
      select: { name: true, avatar: true },
    })

    await touchProjectPresence({
      userId: user.user.id,
      name: profile?.name ?? user.user.name,
      avatar: profile?.avatar ?? user.user.avatar,
      projectId: data.projectId,
      view: data.view ?? null,
      issueId: data.issueId ?? null,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid collaboration heartbeat', details: error.issues }, { status: 400 })
    }
    console.error('Error updating collaboration presence:', error)
    return NextResponse.json({ error: 'Failed to update presence' }, { status: 500 })
  }
}