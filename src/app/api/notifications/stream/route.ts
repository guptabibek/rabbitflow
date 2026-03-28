import { NextRequest } from 'next/server'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { getUnreadCount } from '@/lib/domain/notification-service'

/**
 * Server-Sent Events (SSE) endpoint for real-time notification delivery.
 * Clients connect via EventSource and receive periodic polling updates.
 *
 * In production, replace the polling approach with a Redis pub/sub or
 * dedicated push mechanism. This polling SSE is a safe, horizontally-scalable
 * starting point that requires no additional infrastructure.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request)
  if (!auth.ok) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = auth.user.id
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial unread count
      try {
        const count = await getUnreadCount(userId)
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'unread_count', count })}\n\n`)
        )
      } catch {
        // Non-fatal on initial send
      }

      // Poll for updates every 10 seconds
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval)
          return
        }

        try {
          const count = await getUnreadCount(userId)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'unread_count', count })}\n\n`)
          )
        } catch {
          // Continue on transient errors
        }
      }, 10_000)

      // Heartbeat every 30 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat)
          return
        }

        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
          clearInterval(interval)
          closed = true
        }
      }, 30_000)

      // Auto-close after 5 minutes to prevent stale connections; client will reconnect
      setTimeout(() => {
        closed = true
        clearInterval(interval)
        clearInterval(heartbeat)
        try { controller.close() } catch { /* already closed */ }
      }, 5 * 60 * 1000)
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
