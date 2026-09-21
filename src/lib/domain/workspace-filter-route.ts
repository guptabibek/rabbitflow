import type { IssueFilterCriteria } from '@/lib/domain/issue-filters'

/** Query state shared by the backlog, board, and work-item list. */
export type WorkspaceFilterRouteState = {
  search: string
  workItemType: string
  assigneeId: string | null
  priority: string | null
  iterationId: string | null
  areaId: string | null
  labelIds: string[]
}

const CONTROLLED_KEYS = [
  'search',
  'workItemType',
  'assigneeId',
  'priority',
  'iterationId',
  'areaId',
  'labelIds',
] as const

const PRIORITIES = new Set(['highest', 'high', 'medium', 'low', 'lowest'])

function boundedValue(value: string | null, maxLength = 200) {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed.slice(0, maxLength) : null
}

export function parseWorkspaceFilterRoute(
  search: string | URLSearchParams
): WorkspaceFilterRouteState {
  const params = new URLSearchParams(search)
  const priority = boundedValue(params.get('priority'), 32)
  const labelIds = (boundedValue(params.get('labelIds'), 2_000) ?? '')
    .split(',')
    .map((labelId) => boundedValue(labelId))
    .filter((labelId): labelId is string => Boolean(labelId))

  return {
    search: (params.get('search') ?? '').slice(0, 200),
    workItemType: boundedValue(params.get('workItemType')) ?? 'all',
    assigneeId: boundedValue(params.get('assigneeId')),
    priority: priority && PRIORITIES.has(priority) ? priority : null,
    iterationId: boundedValue(params.get('iterationId')),
    areaId: boundedValue(params.get('areaId')),
    labelIds: Array.from(new Set(labelIds)).slice(0, 20),
  }
}

/**
 * Replace the filter-owned query keys while retaining unrelated route state.
 * Empty/default values stay out of the URL so links remain readable.
 */
export function writeWorkspaceFilterRoute(
  search: string | URLSearchParams,
  filters: IssueFilterCriteria,
  workItemType: string
) {
  const params = new URLSearchParams(search)
  for (const key of CONTROLLED_KEYS) params.delete(key)

  if (filters.search?.trim()) params.set('search', filters.search.slice(0, 200))
  if (workItemType && workItemType !== 'all') params.set('workItemType', workItemType)
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId)
  if (filters.priority && PRIORITIES.has(filters.priority)) {
    params.set('priority', filters.priority)
  }
  if (filters.iterationId) params.set('iterationId', filters.iterationId)
  if (filters.areaId) params.set('areaId', filters.areaId)
  if (filters.labelIds?.length) {
    params.set('labelIds', Array.from(new Set(filters.labelIds)).slice(0, 20).join(','))
  }

  return params
}

export function workspaceFilterRouteSignature(state: WorkspaceFilterRouteState) {
  return JSON.stringify({
    ...state,
    labelIds: [...state.labelIds].sort(),
  })
}
