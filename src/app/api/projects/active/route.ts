import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import {
  getActiveProjectId,
  setActiveProjectCookie,
} from '@/lib/domain/project-context'
import { z } from 'zod'

const setActiveProjectSchema = z.object({
  projectId: z.string().nullable(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request)
  if (!auth.ok) return auth.response

  const memberships = await db.projectMember.findMany({
    where: { userId: auth.user.id, project: { isArchived: false } },
    orderBy: { project: { updatedAt: 'desc' } },
    select: {
      projectId: true,
      role: true,
      project: {
        select: {
          id: true,
          key: true,
          name: true,
          description: true,
          color: true,
          icon: true,
          isArchived: true,
        },
      },
    },
  })

  const activeProjectId = getActiveProjectId(request)
  const selectedMembership =
    memberships.find((membership) => membership.projectId === activeProjectId) ??
    memberships[0] ??
    null

  const response = NextResponse.json({
    project: selectedMembership?.project ?? null,
    role: selectedMembership?.role ?? null,
  })

  setActiveProjectCookie(response, selectedMembership?.project.id ?? null)
  return response
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { projectId } = setActiveProjectSchema.parse(body)

    if (projectId) {
      const membership = await db.projectMember.findFirst({
        where: {
          projectId,
          userId: auth.user.id,
          project: { isArchived: false },
        },
        select: { projectId: true },
      })

      if (!membership) {
        return NextResponse.json(
          { error: 'Project not found in your workspace' },
          { status: 404 }
        )
      }
    }

    const response = NextResponse.json({ success: true, projectId })
    setActiveProjectCookie(response, projectId)
    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update active project' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request)
  if (!auth.ok) return auth.response

  const response = NextResponse.json({ success: true, projectId: null })
  setActiveProjectCookie(response, null)
  return response
}
