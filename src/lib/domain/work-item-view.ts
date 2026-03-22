import type { Issue, WorkItemTypeDefinition } from '@/store/app-store'
import { workItemPath } from '@/lib/domain/work-item-url'

export const UNASSIGNED_VALUE = '__none__'

export type WorkItemDraft = {
  title: string
  description: string
  workItemType: string
  status: Issue['status']
  priority: Issue['priority']
  assigneeId: string
  iterationId: string
  areaId: string
  stateId: string
  parentIssueId: string
  storyPoints: string
  estimatedHours: string
  remainingHours: string
  completedHours: string
  customFields: Record<string, unknown>
}

type PatchPayload = {
  title?: string
  description?: string | null
  status?: Issue['status']
  priority?: Issue['priority']
  assigneeId?: string | null
  iterationId?: string | null
  areaId?: string | null
  stateId?: string | null
  parentIssueId?: string | null
  storyPoints?: number | null
  estimatedHours?: number | null
  remainingHours?: number | null
  completedHours?: number | null
  customFields?: Record<string, unknown>
}

function isPrimitiveEqual(left: unknown, right: unknown) {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    return left.every((value, index) => value === right[index])
  }

  return left === right
}

function normalizeCustomFields(value: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {}
  for (const [key, fieldValue] of Object.entries(value)) {
    normalized[key] = fieldValue ?? null
  }
  return normalized
}

export function canonicalWorkItemRoute(workItemId: string) {
  return workItemPath(workItemId)
}

export function getWorkItemTypeDefinition(
  workItemTypes: WorkItemTypeDefinition[],
  typeKey: string
) {
  return workItemTypes.find((workItemType) => workItemType.key === typeKey) ?? null
}

export function buildWorkItemPatchPayload(current: Issue, draft: WorkItemDraft): PatchPayload | null {
  const payload: PatchPayload = {}

  if (draft.title.trim() !== current.title) payload.title = draft.title.trim()
  if (draft.description !== (current.description ?? '')) payload.description = draft.description || null
  if (draft.status !== current.status) payload.status = draft.status
  if (draft.priority !== current.priority) payload.priority = draft.priority

  const currentAssigneeId = current.assignee?.id ?? UNASSIGNED_VALUE
  if (draft.assigneeId !== currentAssigneeId) {
    payload.assigneeId = draft.assigneeId === UNASSIGNED_VALUE ? null : draft.assigneeId
  }

  const currentIterationId = current.iteration?.id ?? UNASSIGNED_VALUE
  if (draft.iterationId !== currentIterationId) {
    payload.iterationId = draft.iterationId === UNASSIGNED_VALUE ? null : draft.iterationId
  }

  const currentAreaId = current.area?.id ?? UNASSIGNED_VALUE
  if (draft.areaId !== currentAreaId) {
    payload.areaId = draft.areaId === UNASSIGNED_VALUE ? null : draft.areaId
  }

  const currentStateId = current.stateRecord?.id ?? UNASSIGNED_VALUE
  if (draft.stateId !== currentStateId) {
    payload.stateId = draft.stateId === UNASSIGNED_VALUE ? null : draft.stateId
  }

  const currentParentId = current.parentIssue?.id ?? current.parentIssueId ?? UNASSIGNED_VALUE
  if (draft.parentIssueId !== currentParentId) {
    payload.parentIssueId = draft.parentIssueId === UNASSIGNED_VALUE ? null : draft.parentIssueId
  }

  const currentStoryPoints = current.storyPoints?.toString() ?? ''
  if (draft.storyPoints !== currentStoryPoints) {
    payload.storyPoints = draft.storyPoints ? parseInt(draft.storyPoints, 10) : null
  }

  const currentEstimatedHours = current.estimatedHours?.toString() ?? ''
  const draftEstimatedHours = draft.estimatedHours ?? ''
  if (draftEstimatedHours !== currentEstimatedHours) {
    payload.estimatedHours = draftEstimatedHours ? parseFloat(draftEstimatedHours) : null
  }

  const currentRemainingHours = current.remainingHours?.toString() ?? ''
  const draftRemainingHours = draft.remainingHours ?? ''
  if (draftRemainingHours !== currentRemainingHours) {
    payload.remainingHours = draftRemainingHours ? parseFloat(draftRemainingHours) : null
  }

  const currentCompletedHours = current.completedHours?.toString() ?? ''
  const draftCompletedHours = draft.completedHours ?? ''
  if (draftCompletedHours !== currentCompletedHours) {
    payload.completedHours = draftCompletedHours ? parseFloat(draftCompletedHours) : null
  }

  const currentCustomFields = normalizeCustomFields(current.customFields ?? {})
  const nextCustomFields = normalizeCustomFields(draft.customFields)
  const changedCustomFieldKeys = new Set<string>([
    ...Object.keys(currentCustomFields),
    ...Object.keys(nextCustomFields),
  ])

  const changedCustomFields: Record<string, unknown> = {}
  const typeChanged = false
  for (const key of changedCustomFieldKeys) {
    const currentValue = currentCustomFields[key]
    const nextValue = nextCustomFields[key]
    if (typeChanged || !isPrimitiveEqual(currentValue, nextValue)) {
      changedCustomFields[key] = nextValue ?? null
    }
  }

  if (Object.keys(changedCustomFields).length > 0) {
    payload.customFields = changedCustomFields
  }

  return Object.keys(payload).length > 0 ? payload : null
}
