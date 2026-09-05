import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { WEBHOOK_EVENTS, getWebhooks } from '@/lib/domain/webhook-service'
import { assertSafeOutboundUrl } from '@/lib/domain/url-safety'
import crypto from 'crypto'

const createWebhookSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100),
  url: z.string().url().max(2048),
  secret: z.string().max(256).optional(),
  events: z.array(z.string()).min(1),
  headers: z.record(z.string(), z.string()).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    const webhooks = await getWebhooks(projectId)
    return NextResponse.json(webhooks)
  } catch (error) {
    console.error('Error fetching webhooks:', error)
    return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createWebhookSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    // Validate events
    const validEvents = new Set([...WEBHOOK_EVENTS, '*'])
    const invalidEvents = data.events.filter((e) => !validEvents.has(e))
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalidEvents.join(', ')}` },
        { status: 400 }
      )
    }

    // Enforce limit
    const count = await db.webhook.count({ where: { projectId: data.projectId } })
    if (count >= 20) {
      return NextResponse.json(
        { error: 'Maximum 20 webhooks per project' },
        { status: 400 }
      )
    }

    // Reject URLs that point at internal infrastructure before storing them.
    // Without this the dispatcher would happily fetch the cloud metadata service
    // or anything on the internal network and surface the response body in the
    // delivery log.
    const urlCheck = await assertSafeOutboundUrl(data.url)
    if (!urlCheck.ok) {
      return NextResponse.json({ error: urlCheck.reason }, { status: 400 })
    }

    // Auto-generate secret if not provided
    const secret = data.secret || crypto.randomBytes(32).toString('hex')

    const webhook = await db.webhook.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        url: data.url,
        secret,
        events: data.events,
        headers: data.headers ?? undefined,
        createdById: auth.actor.userId,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(webhook, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating webhook:', error)
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 })
  }
}
