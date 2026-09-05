import { NextRequest, NextResponse } from 'next/server'
import { db, isUniqueConstraintError } from '@/lib/db'
import { requireAuthenticatedUser, requireSystemAdmin } from '@/lib/domain/auth'
import { setActiveProjectCookie } from '@/lib/domain/project-context'
import { seedOnboardingStepsTx } from '@/lib/domain/onboarding-engine'
import { ensureProjectSystemRecordsTx } from '@/lib/domain/project-system-records'
import { SYSTEM_RECORDS_VERSION } from '@/lib/domain/project-bootstrap'
import { z } from 'zod'

const createProjectSchema = z.object({
  key: z.string().min(2).max(10).regex(/^[A-Z]+$/, 'Key must be uppercase letters only'),
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const memberships = await db.projectMember.findMany({
      where: {
        userId: auth.user.id,
        project: { isArchived: false },
      },
      orderBy: { project: { updatedAt: 'desc' } },
      select: {
        role: true,
        project: {
          include: {
            _count: {
              select: { issues: true, members: true },
            },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    avatar: true,
                    globalRole: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    const projects = memberships.map((membership) => ({
      ...membership.project,
      currentUserRole: membership.role,
    }))

    return NextResponse.json(projects)
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSystemAdmin(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = createProjectSchema.parse(body)

    const project = await db.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          key: data.key,
          name: data.name,
          description: data.description,
          color: data.color || '#6366f1',
          icon: data.icon,
          members: {
            create: {
              userId: auth.user.id,
              role: 'Admin',
            },
          },
        },
        select: { id: true },
      })

      await ensureProjectSystemRecordsTx(tx, createdProject.id, auth.user.id)
      await seedOnboardingStepsTx(tx, createdProject.id)

      // Stamp the provisioning revision inside the same transaction, so a
      // project is either fully provisioned and marked, or neither. Read paths
      // check this column instead of counting records.
      await tx.project.update({
        where: { id: createdProject.id },
        data: { systemRecordsVersion: SYSTEM_RECORDS_VERSION },
      })

      return tx.project.findUniqueOrThrow({
        where: { id: createdProject.id },
        include: {
          _count: {
            select: { issues: true, members: true },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                  globalRole: true,
                },
              },
            },
          },
        },
      })
    })

    const response = NextResponse.json(
      { ...project, currentUserRole: 'Admin' },
      { status: 201 }
    )
    setActiveProjectCookie(response, project.id)
    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    if (isUniqueConstraintError(error, ['key'])) {
      return NextResponse.json({ error: 'A project with this key already exists' }, { status: 409 })
    }
    console.error('Error creating project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
