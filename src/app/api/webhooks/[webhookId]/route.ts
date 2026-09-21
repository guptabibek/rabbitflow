import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { WEBHOOK_EVENTS, getWebhookDeliveries } from '@/lib/domain/webhook-service'
import { assertSafeOutboundUrl } from '@/lib/domain/url-safety'

const updateWebhookSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  url: z.string().url().max(2048).optional(),
  secret: z.string().max(256).optional(),
  events: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).nullable().optional(),
})

async function resolveWebhook(id: string) {
  return db.webhook.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  try {
    const { webhookId: id } = await params
    const webhook = await resolveWebhook(id)

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, webhook.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const includeDeliveries = searchParams.get('deliveries') === 'true'

    const full = await db.webhook.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { deliveries: true } },
      },
    })

    if (includeDeliveries) {
      const deliveries = await getWebhookDeliveries(id, 50)
      return NextResponse.json({ ...full, deliveries })
    }

    return NextResponse.json(full)
  } catch (error) {
    console.error('Error fetching webhook:', error)
    return NextResponse.json({ error: 'Failed to fetch webhook' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  try {
    const { webhookId: id } = await params
    const webhook = await resolveWebhook(id)

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, webhook.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateWebhookSchema.parse(body)

    if (data.events) {
      const validEvents = new Set([...WEBHOOK_EVENTS, '*'])
      const invalidEvents = data.events.filter((e) => !validEvents.has(e))
      if (invalidEvents.length > 0) {
        return NextResponse.json(
          { error: `Invalid events: ${invalidEvents.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Re-validate on update: otherwise a webhook could be created with a public
    // URL and then repointed at internal infrastructure.
    if (data.url !== undefined) {
      const urlCheck = await assertSafeOutboundUrl(data.url)
      if (!urlCheck.ok) {
        return NextResponse.json({ error: urlCheck.reason }, { status: 400 })
      }
    }

    const updated = await db.webhook.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.url !== undefined && { url: data.url }),
        ...(data.secret !== undefined && { secret: data.secret }),
        ...(data.events !== undefined && { events: data.events }),
        ...(data.isActive !== undefined && {
          isActive: data.isActive,
          // Reset failure count when re-enabling
          ...(data.isActive && { failureCount: 0 }),
        }),
        ...(data.headers !== undefined && { headers: data.headers as Prisma.InputJsonValue ?? Prisma.DbNull }),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating webhook:', error)
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  try {
    const { webhookId: id } = await params
    const webhook = await resolveWebhook(id)

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, webhook.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    await db.webhook.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting webhook:', error)
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 })
  }
}
