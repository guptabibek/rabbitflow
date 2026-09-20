export type PlanningFilterState = {
  ownerId: string | null
  teamId: string | null
  areaId: string | null
  objectiveId: string | null
  workItemType: string | null
  status: string | null
  dateFrom: string | null
  dateTo: string | null
  releaseId: string | null
}

export type PlanningFilterItem = {
  assignee?: { id: string } | null
  area?: { id: string } | null
  iteration?: {
    id: string
    iterationType?: string | null
    team?: { id: string } | null
  } | null
  objectives?: Array<{ id: string }>
  workItemType: string
  status: string
  startDate?: string | null
  dueDate?: string | null
  endDate?: string | null
}

export const EMPTY_PLANNING_FILTERS: PlanningFilterState = {
  ownerId: null,
  teamId: null,
  areaId: null,
  objectiveId: null,
  workItemType: null,
  status: null,
  dateFrom: null,
  dateTo: null,
  releaseId: null,
}

const PARAMS = {
  ownerId: 'planOwner',
  teamId: 'planTeam',
  areaId: 'planArea',
  objectiveId: 'planObjective',
  workItemType: 'planType',
  status: 'planState',
  dateFrom: 'planFrom',
  dateTo: 'planTo',
  releaseId: 'planRelease',
} as const

function bounded(value: string | null) {
  const normalized = value?.trim() ?? ''
  return normalized ? normalized.slice(0, 200) : null
}

function dateOnly(value: string | null) {
  const normalized = bounded(value)
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

export function parsePlanningFilters(search: string | URLSearchParams): PlanningFilterState {
  const params = new URLSearchParams(search)
  return {
    ownerId: bounded(params.get(PARAMS.ownerId)),
    teamId: bounded(params.get(PARAMS.teamId)),
    areaId: bounded(params.get(PARAMS.areaId)),
    objectiveId: bounded(params.get(PARAMS.objectiveId)),
    workItemType: bounded(params.get(PARAMS.workItemType)),
    status: bounded(params.get(PARAMS.status)),
    dateFrom: dateOnly(params.get(PARAMS.dateFrom)),
    dateTo: dateOnly(params.get(PARAMS.dateTo)),
    releaseId: bounded(params.get(PARAMS.releaseId)),
  }
}

export function writePlanningFilters(
  search: string | URLSearchParams,
  filters: PlanningFilterState
) {
  const params = new URLSearchParams(search)
  for (const key of Object.values(PARAMS)) params.delete(key)
  for (const [field, key] of Object.entries(PARAMS) as Array<[
    keyof PlanningFilterState,
    string,
  ]>) {
    const value = filters[field]
    if (value) params.set(key, value)
  }
  return params
}

function dayTime(value: string | null | undefined, endOfDay = false) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (endOfDay) date.setHours(23, 59, 59, 999)
  else date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function matchesPlanningFilters(item: PlanningFilterItem, filters: PlanningFilterState) {
  if (filters.ownerId && item.assignee?.id !== filters.ownerId) return false
  if (filters.teamId && item.iteration?.team?.id !== filters.teamId) return false
  if (filters.areaId && item.area?.id !== filters.areaId) return false
  if (filters.objectiveId && !item.objectives?.some((objective) => objective.id === filters.objectiveId)) {
    return false
  }
  if (filters.workItemType && item.workItemType !== filters.workItemType) return false
  if (filters.status && item.status !== filters.status) return false
  if (
    filters.releaseId &&
    (item.iteration?.iterationType !== 'release' || item.iteration.id !== filters.releaseId)
  ) {
    return false
  }

  const itemStart = dayTime(item.startDate ?? item.dueDate ?? item.endDate)
  const itemEnd = dayTime(item.dueDate ?? item.endDate ?? item.startDate, true)
  const filterStart = dayTime(filters.dateFrom)
  const filterEnd = dayTime(filters.dateTo, true)
  if (filterStart !== null && (itemEnd === null || itemEnd < filterStart)) return false
  if (filterEnd !== null && (itemStart === null || itemStart > filterEnd)) return false
  return true
}

export function hasPlanningFilters(filters: PlanningFilterState) {
  return Object.values(filters).some(Boolean)
}
