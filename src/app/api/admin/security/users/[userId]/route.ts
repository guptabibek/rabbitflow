import { NextRequest, NextResponse } from 'next/server'
import { invalidateUserMfaChallenges } from '@/lib/auth-otp'
import { db } from '@/lib/db'
import { requireSystemAdmin } from '@/lib/domain/auth'
import { createSecurityAuditEvent } from '@/lib/security-audit'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await requireSystemAdmin(request)
    if (!admin.ok) return admin.response

    const { userId: id } = await params

    if (id === admin.user.id) {
      return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 400 })
    }

    const targetUser = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        globalRole: true,
        isActive: true,
      },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!targetUser.isActive) {
      return NextResponse.json({ error: 'User is already deactivated.' }, { status: 409 })
    }

    if (targetUser.globalRole === 'admin') {
      const remainingAdmins = await db.user.count({
        where: {
          globalRole: 'admin',
          isActive: true,
          id: { not: id },
        },
      })

      if (remainingAdmins === 0) {
        return NextResponse.json(
          { error: 'At least one active administrator must remain.' },
          { status: 400 }
        )
      }
    }

    const now = new Date()

    const result = await db.$transaction(async (tx) => {
      const revoked = await tx.authSession.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: `USER_DEACTIVATED_BY:${admin.user.id}`,
        },
      })

      const projectMemberships = await tx.projectMember.deleteMany({
        where: { userId: id },
      })

      const teamMemberships = await tx.teamMember.deleteMany({
        where: { userId: id },
      })

      const sprintCapacities = await tx.sprintCapacity.deleteMany({
        where: { userId: id },
      })

      const clearedAssignments = await tx.issue.updateMany({
        where: { assigneeId: id },
        data: { assigneeId: null },
      })

      await tx.team.updateMany({
        where: { leadId: id },
        data: { leadId: null },
      })

      await tx.user.update({
        where: { id },
        data: {
          isActive: false,
          deactivatedAt: now,
          mfaSecret: null,
          mfaEnabled: false,
          mfaEnabledAt: null,
          mfaExemptFromPolicy: false,
          mfaReenrollRequired: false,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      })

      return {
        revokedSessions: revoked.count,
        removedProjectMemberships: projectMemberships.count,
        removedTeamMemberships: teamMemberships.count,
        removedSprintCapacities: sprintCapacities.count,
        clearedAssignments: clearedAssignments.count,
      }
    })

    await createSecurityAuditEvent({
      actorUserId: admin.user.id,
      targetUserId: id,
      action: 'USER_DEACTIVATED',
      details: result,
    })

    // Scoped to this user: invalidating every user's in-flight challenge would
    // break sign-in for anyone mid-authentication elsewhere in the system.
    await invalidateUserMfaChallenges(id)

    return NextResponse.json({
      success: true,
      message: 'User access removed and account deactivated.',
      ...result,
    })
  } catch (error) {
    console.error('Admin user deactivation error:', error)
    return NextResponse.json({ error: 'Failed to deactivate user' }, { status: 500 })
  }
}