import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { listPermissions, normalizeProjectRole } from '@/lib/domain/rbac'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const membership = await db.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: auth.user.id,
        },
      },
      select: {
        role: true,
        project: { select: { id: true, name: true, key: true } },
        user: { select: { id: true, name: true, email: true, globalRole: true } },
      },
    })

    if (!membership) {
      return NextResponse.json(
        {
          projectId,
          userId: auth.user.id,
          role: 'Viewer',
          permissions: listPermissions('Viewer'),
          membership: null,
        },
        { status: 200 }
      )
    }

    const normalizedRole = normalizeProjectRole(membership.role)

    return NextResponse.json({
      projectId,
      userId: auth.user.id,
      role: normalizedRole,
      rawRole: membership.role,
      permissions: listPermissions(normalizedRole),
      membership,
    })
  } catch (error) {
    console.error('Error resolving RBAC permissions:', error)
    return NextResponse.json({ error: 'Failed to resolve permissions' }, { status: 500 })
  }
}
