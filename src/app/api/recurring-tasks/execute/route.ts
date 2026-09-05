import { NextRequest, NextResponse } from 'next/server'
import { queueSlaTimers } from '@/lib/job-queue'
import { db } from '@/lib/db'
import { formatProjectIssueKey } from '@/lib/domain/issue-key-format'
import { getMaxProjectIssueNumber, lockProjectIssueSequence } from '@/lib/domain/issue-key-sequence'
import { attachSlaTimers } from '@/lib/domain/sla-engine'
import { secretsMatch } from '@/lib/auth-otp'
import { computeNextRun } from '../route'

const CRON_SECRET = process.env.CRON_SECRET

// POST /api/recurring-tasks/execute
// Called by an external cron scheduler (e.g. Vercel Cron, crontab, GitHub Actions)
// to instantiate issues from recurring task templates whose nextRunAt has passed.
//
// Secured by a shared CRON_SECRET header to prevent unauthorized invocation.
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const secret = request.headers.get('x-cron-secret')
    if (!CRON_SECRET || !secret || !secretsMatch(CRON_SECRET, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    // Find all active recurring tasks whose nextRunAt is in the past
    const dueTasks = await db.recurringTask.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
      include: {
        project: { select: { key: true } },
        createdBy: { select: { id: true } },
      },
      take: 100, // Batch limit to prevent timeout
    })

    if (dueTasks.length === 0) {
      return NextResponse.json({ created: 0, tasks: [] })
    }

    const results: { taskId: string; issueKey: string }[] = []
    const errors: { taskId: string; error: string }[] = []

    for (const task of dueTasks) {
      try {
        await db.$transaction(async (tx) => {
          await lockProjectIssueSequence(tx, task.projectId)

          const issueNumber =
            (await getMaxProjectIssueNumber(tx, task.projectId, task.project.key)) + 1

          const issueKey = formatProjectIssueKey(task.project.key, issueNumber)

          // Find the first state in this project (by order) as initial
          const initialState = await tx.state.findFirst({
            where: { projectId: task.projectId },
            orderBy: { order: 'asc' },
            select: { id: true, category: true },
          })

          // Compute column order
          const lastInStatus = await tx.issue.findFirst({
            where: { projectId: task.projectId, status: 'backlog' },
            orderBy: { columnOrder: 'desc' },
            select: { columnOrder: true },
          })

          // Create the issue from template
          // Resolve a valid reporter: prefer the task creator, fall back to a project admin
          let reporterId = task.createdBy?.id ?? task.createdById ?? undefined
          if (!reporterId) {
            const admin = await tx.projectMember.findFirst({
              where: { projectId: task.projectId, role: { in: ['Admin', 'owner', 'admin'] } },
              select: { userId: true },
            })
            reporterId = admin?.userId
          }

          if (!reporterId) {
            throw new Error('No valid reporter found for recurring task')
          }

          const issue = await tx.issue.create({
            data: {
              key: issueKey,
              projectId: task.projectId,
              title: task.templateTitle,
              description: task.templateBody,
              workItemType: task.templateType,
              priority: task.templatePriority,
              status: 'backlog',
              assigneeId: task.templateAssigneeId,
              reporterId,
              iterationId: task.templateIterationId,
              areaId: task.templateAreaId,
              stateId: initialState?.id ?? null,
              columnOrder: (lastInStatus?.columnOrder ?? 0) + 1000,
            },
          })

          // Apply template labels if any
          const labels = Array.isArray(task.templateLabels) ? task.templateLabels as string[] : []
          if (labels.length > 0) {
            await tx.issueLabel.createMany({
              data: labels.map((labelId) => ({
                issueId: issue.id,
                labelId,
              })),
              skipDuplicates: true,
            })
          }

          // Update the recurring task: advance nextRunAt and bump runCount
          const nextRun = computeNextRun(task.rrule, now)
          await tx.recurringTask.update({
            where: { id: task.id },
            data: {
              lastRunAt: now,
              nextRunAt: nextRun,
              runCount: { increment: 1 },
            },
          })

          results.push({ taskId: task.id, issueKey })

          // Attach SLA timers outside the transaction
          void queueSlaTimers(issue.id, task.projectId, issue.priority, issue.workItemType)
        })
      } catch (err) {
        console.error(`Recurring task ${task.id} failed:`, err)
        errors.push({ taskId: task.id, error: String(err) })
      }
    }

    return NextResponse.json({
      created: results.length,
      failed: errors.length,
      tasks: results,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error executing recurring tasks:', error)
    return NextResponse.json({ error: 'Failed to execute recurring tasks' }, { status: 500 })
  }
}
