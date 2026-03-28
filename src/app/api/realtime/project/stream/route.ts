import { NextRequest } from 'next/server'
import { getAreaAccessScope } from '@/lib/domain/access-control'
import { requireProjectPermission } from '@/lib/domain/auth'
import { getRecentProjectActivity, listProjectPresence } from '@/lib/domain/collaboration'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')

  if (!projectId) {
    return new Response('projectId is required', { status: 400 })
  }

  const auth = await requireProjectPermission(request, projectId, 'collaboration:read', undefined, {
    allowScoped: true,
  })
  if (!auth.ok) {
    return new Response('Unauthorized', { status: 401 })
  }

  const scope = await getAreaAccessScope(projectId, auth.actor.projectRole, 'workitem:read', auth.actor.extraPermissions)
  const encoder = new TextEncoder()
  let closed = false
  let lastActivityAt = new Date(Date.now() - 60_000)

  const stream = new ReadableStream({
    async start(controller) {
      const sendSnapshot = async () => {
        const [presence, activity] = await Promise.all([
          listProjectPresence(projectId),
          getRecentProjectActivity(projectId, lastActivityAt),
        ])

        const visibleActivity = activity.filter((entry) => {
          if (!entry.issue) return true
          if (entry.issue.areaId === null) return scope.allowUnassigned
          return scope.allowedAreaIds.includes(entry.issue.areaId)
        })

        if (visibleActivity[0]?.createdAt) {
          lastActivityAt = visibleActivity[0].createdAt
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'snapshot',
              presence,
              activity: visibleActivity,
              emittedAt: new Date().toISOString(),
            })}\n\n`
          )
        )
      }

      try {
        await sendSnapshot()
      } catch {
        controller.enqueue(encoder.encode(': warmup-failed\n\n'))
      }

      const poller = setInterval(async () => {
        if (closed) {
          clearInterval(poller)
          return
        }

        try {
          await sendSnapshot()
        } catch {
          controller.enqueue(encoder.encode(': transient-error\n\n'))
        }
      }, 8_000)

      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat)
          return
        }

        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          closed = true
          clearInterval(poller)
          clearInterval(heartbeat)
        }
      }, 25_000)

      setTimeout(() => {
        closed = true
        clearInterval(poller)
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {
          // Already closed
        }
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