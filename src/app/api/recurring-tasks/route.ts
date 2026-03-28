import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const createRecurringTaskSchema = z.object({
  projectId: z.string().trim().min(1),
  templateTitle: z.string().trim().min(1).max(500),
  templateBody: z.string().max(50000).nullable().optional(),
  templateType: z.string().trim().min(1).default('task'),
  templatePriority: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).optional(),
  templateAssigneeId: z.string().trim().min(1).nullable().optional(),
  rrule: z.string().trim().min(1),
  timezone: z.string().trim().min(1).default('UTC'),
  startDate: z.string().trim().min(1).optional(),
})

// GET /api/recurring-tasks?projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    const tasks = await db.recurringTask.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(tasks)
  } catch (error) {
    console.error('Error fetching recurring tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch recurring tasks' }, { status: 500 })
  }
}

// POST /api/recurring-tasks
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createRecurringTaskSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    const fromDate = data.startDate ? new Date(data.startDate) : new Date()
    const nextRun = computeNextRun(data.rrule, fromDate)

    const task = await db.recurringTask.create({
      data: {
        projectId: data.projectId,
        createdById: auth.actor.userId,
        templateTitle: data.templateTitle,
        templateBody: data.templateBody ?? null,
        templateType: data.templateType ?? 'task',
        templatePriority: data.templatePriority ?? 'medium',
        templateAssigneeId: data.templateAssigneeId ?? null,
        rrule: data.rrule,
        timezone: data.timezone ?? 'UTC',
        nextRunAt: nextRun,
      },
    })

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating recurring task:', error)
    return NextResponse.json({ error: 'Failed to create recurring task' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// RRULE helpers – supports FREQ=DAILY|WEEKLY|MONTHLY|YEARLY with INTERVAL
// ---------------------------------------------------------------------------

function parseRRule(rrule: string): { freq: string; interval: number } {
  const parts = rrule.replace(/^RRULE:/i, '').split(';')
  let freq = 'WEEKLY'
  let interval = 1
  for (const part of parts) {
    const [key, val] = part.split('=')
    if (key?.toUpperCase() === 'FREQ') freq = val?.toUpperCase() ?? 'WEEKLY'
    if (key?.toUpperCase() === 'INTERVAL') interval = Math.max(1, parseInt(val ?? '1', 10))
  }
  return { freq, interval }
}

export function computeNextRun(rrule: string, fromDate: Date): Date {
  const { freq, interval } = parseRRule(rrule)
  const next = new Date(fromDate)
  const now = new Date()

  // Advance to at least 'now' first
  if (next <= now) {
    next.setTime(now.getTime())
  }

  switch (freq) {
    case 'DAILY':
      next.setDate(next.getDate() + interval)
      break
    case 'WEEKLY':
      next.setDate(next.getDate() + 7 * interval)
      break
    case 'MONTHLY':
      next.setMonth(next.getMonth() + interval)
      break
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + interval)
      break
    default:
      // Fallback: treat unknown as weekly
      next.setDate(next.getDate() + 7)
      break
  }

  return next
}

export function rruleToLabel(rrule: string): string {
  const { freq, interval } = parseRRule(rrule)
  const labels: Record<string, string> = {
    DAILY: 'Daily',
    WEEKLY: 'Weekly',
    MONTHLY: 'Monthly',
    YEARLY: 'Yearly',
  }
  const base = labels[freq] ?? freq
  if (interval === 1) return base
  if (freq === 'WEEKLY' && interval === 2) return 'Bi-weekly'
  if (freq === 'MONTHLY' && interval === 3) return 'Quarterly'
  return `Every ${interval} ${freq.toLowerCase().replace('ly', '')}s`
}
