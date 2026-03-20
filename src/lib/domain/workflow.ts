import { z } from 'zod'

export const WORK_ITEM_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'cancelled',
] as const

export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number]

export const workItemStatusSchema = z.enum(WORK_ITEM_STATUSES)

const ALLOWED_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['in_progress', 'backlog', 'cancelled'],
  in_progress: ['in_review', 'todo', 'cancelled'],
  in_review: ['done', 'in_progress', 'cancelled'],
  done: ['in_review'],
  cancelled: ['backlog'],
}

export function canTransition(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) return true
  const current = fromStatus as WorkItemStatus
  const next = toStatus as WorkItemStatus
  const allowed = ALLOWED_TRANSITIONS[current] ?? []
  return allowed.includes(next)
}

export function assertTransition(fromStatus: string, toStatus: string) {
  if (!canTransition(fromStatus, toStatus)) {
    throw new Error(`Invalid transition from ${fromStatus} to ${toStatus}`)
  }
}

export function getAllowedTransitions(fromStatus: string): WorkItemStatus[] {
  return ALLOWED_TRANSITIONS[fromStatus as WorkItemStatus] ?? []
}
