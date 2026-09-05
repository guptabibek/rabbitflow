import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { listPermissions, normalizeProjectRole } from '@/lib/domain/rbac'
import { getProjectPermissionRules } from '@/lib/domain/access-control'

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
        extraPermissions: true,
        project: { select: { id: true, name: true, key: true } },
        user: { select: { id: true, name: true, email: true, globalRole: true } },
      },
    })

    if (!membership) {
      // System admins have implicit access to every project, matching the
      // fallback in resolveActorContextResult().
      if (auth.user.globalRole === 'admin') {
        return NextResponse.json({
          projectId,
          userId: auth.user.id,
          role: 'Admin',
          permissions: listPermissions('Admin'),
          membership: null,
        })
      }

      // Previously this returned 200 with a full Viewer permission set, which
      // confirmed the project existed and made the UI render a read-enabled
      // workspace whose every subsequent API call then failed. Non-members get
      // no permissions and no confirmation that the project exists.
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const normalizedRole = normalizeProjectRole(membership.role)
    const rules = await getProjectPermissionRules(projectId)

    return NextResponse.json({
      projectId,
      userId: auth.user.id,
      role: normalizedRole,
      rawRole: membership.role,
      permissions: listPermissions(normalizedRole, {
        rules: rules.map((rule) => ({
          role: rule.role,
          permission: rule.permission,
          effect: rule.effect,
          areaId: rule.areaId,
        })),
        extraPermissions: Array.isArray(membership.extraPermissions)
          ? membership.extraPermissions.filter((value): value is string => typeof value === 'string')
          : [],
      }),
      rules,
      membership,
    })
  } catch (error) {
    console.error('Error resolving RBAC permissions:', error)
    return NextResponse.json({ error: 'Failed to resolve permissions' }, { status: 500 })
  }
}
