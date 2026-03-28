import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { getActiveProjectId, setActiveProjectCookie } from '@/lib/domain/project-context'

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  isArchived: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId: id } = await params

    const auth = await requireProjectPermission(request, id, 'project:read')
    if (!auth.ok) return auth.response

    const project = await db.project.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: true },
        },
        labels: true,
        iterations: {
          where: { iterationType: 'sprint' },
          orderBy: { startDate: 'desc' },
          include: { _count: { select: { issues: true } } },
        },
        _count: {
          select: { issues: true },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json(project)
  } catch (error) {
    console.error('Error fetching project:', error)
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId: id } = await params
    const body = await request.json()
    const data = updateProjectSchema.parse(body)

    const auth = await requireProjectPermission(request, id, 'project:update')
    if (!auth.ok) return auth.response

    const existing = await db.project.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = await db.project.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        description: data.description === undefined ? undefined : data.description.trim() || null,
        color: data.color,
        icon: data.icon,
        isArchived: data.isArchived,
      },
    })

    await invalidateProjectCaches(id)

    const response = NextResponse.json(project)
    if (project.isArchived && getActiveProjectId(request) === id) {
      setActiveProjectCookie(response, null)
    }

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error updating project:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId: id } = await params

    const auth = await requireProjectPermission(request, id, 'project:update')
    if (!auth.ok) return auth.response

    await db.project.delete({ where: { id } })
    await invalidateProjectCaches(id)

    const response = NextResponse.json({ success: true })
    if (getActiveProjectId(request) === id) {
      setActiveProjectCookie(response, null)
    }

    return response
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
