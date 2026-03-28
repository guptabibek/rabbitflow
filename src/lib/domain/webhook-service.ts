import { db } from '@/lib/db'
import { type Prisma } from '@prisma/client'
import crypto from 'crypto'
import { createAuditLog } from '@/lib/domain/audit'
import {
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_MAX_ATTEMPTS,
  buildWebhookRetryPlan,
} from '@/lib/domain/webhook-retry'
import {
  getProjectAuditActorUserId,
  notifyProjectOperators,
} from '@/lib/domain/notification-service'

// ============================================================================
// WEBHOOK EVENT TYPES
// ============================================================================

export const WEBHOOK_EVENTS = [
  'issue.created',
  'issue.updated',
  'issue.deleted',
  'issue.status_changed',
  'issue.assigned',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'sprint.started',
  'sprint.completed',
  'member.added',
  'member.removed',
  'label.created',
  'label.deleted',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

// ============================================================================
// WEBHOOK DISPATCH
// ============================================================================

type WebhookPayload = {
  event: WebhookEvent
  timestamp: string
  projectId: string
  data: Record<string, unknown>
}

const WEBHOOK_DISABLE_AFTER_FAILURES = 10

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Dispatch a webhook event to all active webhooks for a project.
 * Runs asynchronously (fire-and-forget from caller's perspective).
 */
export async function dispatchWebhookEvent(
  projectId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const webhooks = await db.webhook.findMany({
      where: {
        projectId,
        isActive: true,
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        url: true,
        secret: true,
        events: true,
        headers: true,
        createdById: true,
      },
    })

    const matching = webhooks.filter((wh) => {
      const events = wh.events as string[]
      return Array.isArray(events) && (events.includes(event) || events.includes('*'))
    })

    if (matching.length === 0) return

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      projectId,
      data,
    }

    const payloadString = JSON.stringify(payload)

    // Fire all deliveries concurrently
    await Promise.allSettled(
      matching.map((webhook) => deliverWebhook(webhook, event, payloadString))
    )
  } catch (error) {
    console.error('Webhook dispatch error:', error)
  }
}

async function deliverWebhook(
  webhook: {
    id: string
    projectId: string
    name: string
    url: string
    secret: string | null
    headers: unknown
    createdById: string | null
  },
  event: string,
  payloadString: string
): Promise<void> {
  const payload = JSON.parse(payloadString) as Record<string, unknown>
  let finalStatusCode: number | null = null
  let finalResponseBody: string | null = null
  let finalError: string | null = null
  let success = false

  for (const retryAttempt of buildWebhookRetryPlan()) {
    if (retryAttempt.delayMs > 0) {
      await sleep(retryAttempt.delayMs)
    }

    const startTime = Date.now()
    let statusCode: number | null = null
    let responseBody: string | null = null
    let error: string | null = null

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'RabbitFlow-Webhook/1.0',
        'X-Webhook-Event': event,
        'X-Webhook-Delivery': crypto.randomUUID(),
      }

      if (webhook.secret) {
        const hmac = crypto.createHmac('sha256', webhook.secret)
        hmac.update(payloadString)
        headers['X-Webhook-Signature-256'] = `sha256=${hmac.digest('hex')}`
      }

      if (webhook.headers && typeof webhook.headers === 'object') {
        const customHeaders = webhook.headers as Record<string, string>
        for (const [key, value] of Object.entries(customHeaders)) {
          if (!key.toLowerCase().startsWith('x-webhook-')) {
            headers[key] = value
          }
        }
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payloadString,
          signal: controller.signal,
        })

        statusCode = response.status
        responseBody = await response.text().catch(() => null)
        success = response.ok

        if (!success) {
          error = `HTTP ${statusCode}`
        }
      } finally {
        clearTimeout(timeout)
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error'
      success = false
    }

    finalStatusCode = statusCode
    finalResponseBody = responseBody
    finalError = error

    await db.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: payload as Prisma.InputJsonValue,
        statusCode,
        responseBody: responseBody?.slice(0, 4096) ?? null,
        duration: Date.now() - startTime,
        success,
        attempt: retryAttempt.attempt,
        error,
      },
    })

    if (success) {
      break
    }
  }

  const updatedWebhook = await db.webhook.update({
    where: { id: webhook.id },
    data: {
      lastTriggeredAt: new Date(),
      failureCount: success ? 0 : { increment: 1 },
    },
    select: {
      failureCount: true,
      isActive: true,
    },
  })

  if (!success) {
    const shouldDisable = updatedWebhook.failureCount >= WEBHOOK_DISABLE_AFTER_FAILURES
    if (shouldDisable && updatedWebhook.isActive) {
      await db.webhook.update({
        where: { id: webhook.id },
        data: { isActive: false },
      })
    }

    const auditActorUserId = await getProjectAuditActorUserId(
      webhook.projectId,
      webhook.createdById
    )

    await notifyProjectOperators(webhook.projectId, {
      actorId: webhook.createdById,
      type: 'webhook_failed',
      title: `Webhook delivery failed: ${webhook.name}`,
      body: finalError ?? `Failed after ${WEBHOOK_MAX_ATTEMPTS} attempts`,
      entityType: 'webhook',
      entityId: webhook.id,
      metadata: {
        webhookId: webhook.id,
        webhookName: webhook.name,
        event,
        url: webhook.url,
        attemptCount: WEBHOOK_MAX_ATTEMPTS,
        failureCount: updatedWebhook.failureCount,
        autoDisabled: shouldDisable,
        statusCode: finalStatusCode,
        error: finalError,
        responseBody: finalResponseBody,
      },
    })

    if (auditActorUserId) {
      await createAuditLog({
        projectId: webhook.projectId,
        userId: auditActorUserId,
        action: shouldDisable ? 'webhook_auto_disabled' : 'webhook_delivery_failed',
        details: {
          webhookId: webhook.id,
          webhookName: webhook.name,
          event,
          url: webhook.url,
          attempts: WEBHOOK_MAX_ATTEMPTS,
          failureCount: updatedWebhook.failureCount,
          autoDisabled: shouldDisable,
          statusCode: finalStatusCode,
          error: finalError,
        },
      })
    }
  }
}

// ============================================================================
// WEBHOOK MANAGEMENT
// ============================================================================

export async function getWebhooks(projectId: string) {
  return db.webhook.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { deliveries: true } },
    },
  })
}

export async function getWebhookDeliveries(webhookId: string, limit = 20) {
  return db.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  })
}
