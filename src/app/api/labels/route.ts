import { NextRequest, NextResponse } from 'next/server'
import { internalError, readRequestId, validationError } from '@/lib/api-error'
import { queueWebhookEvent } from '@/lib/job-queue'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { dispatchWebhookEvent } from '@/lib/domain/webhook-service'
import { withCache } from '@/lib/redis'
import { z } from 'zod'

const createLabelSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  color: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const labels = await withCache(`labels:${projectId}:all`, 30, () =>
      db.label.findMany({
        where: { projectId },
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { issues: true } },
        },
      })
    )

    return NextResponse.json(labels)
  } catch (error) {
    return internalError('Error fetching labels:', error, readRequestId(request))
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createLabelSchema.parse(body)

    const auth = await requireProjectPermission(
      request,
      data.projectId,
      'workitem:update'
    )
    if (!auth.ok) return auth.response

    const label = await db.label.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        color: data.color || '#6b7280',
      },
    })

    void queueWebhookEvent(data.projectId, 'label.created', {
      label: {
        id: label.id,
        name: label.name,
        color: label.color,
      },
      actorUserId: auth.actor.userId,
    })

    await invalidateProjectCaches(data.projectId)

    return NextResponse.json(label, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationError(error, readRequestId(request))
    }
    return internalError('Error creating label:', error, readRequestId(request))
  }
}
