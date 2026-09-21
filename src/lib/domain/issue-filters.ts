/**
 * The canonical work-item filter predicate.
 *
 * This logic was duplicated across List View, the Kanban board and the sprint
 * views, and the copies had drifted apart: the board honoured `filters.type`
 * and searched descriptions, while the list ignored both. Applying the same
 * filter and then switching view therefore produced different results, with
 * nothing to indicate which was right.
 *
 * Pure and dependency-free so it can be unit tested directly, and so the same
 * rules can later be mapped onto a server-side query.
 */

export type IssueFilterCriteria = {
  assigneeId?: string | null
  priority?: string | null
  /** Work-item type selected in the filter bar. */
  type?: string | null
  search?: string
  iterationId?: string | null
  areaId?: string | null
  labelIds?: string[]
}

/**
 * The shape the predicate reads. Deliberately structural rather than the full
 * store type, so this module stays free of UI dependencies and is easy to
 * exercise in tests.
 */
export type FilterableIssue = {
  key: string
  title: string
  description?: string | null
  priority: string
  workItemType: string
  assignee?: { id: string } | null
  iteration?: { id: string } | null
  area?: { id: string } | null
  labels?: Array<{ label: { id: string } }>
}

export type IssueFilterOptions = {
  /**
   * The work-item type tab, which is separate from `criteria.type`: the tab is a
   * view-level scope while the filter-bar value is a user-applied filter. Both
   * must match when both are set.
   */
  workItemTypeTab?: string
  /**
   * Whether free-text search also looks at the description.
   *
   * Defaults to true. The list view previously searched only key and title,
   * which silently hid matches the board would show.
   */
  searchDescription?: boolean
}

function matchesSearch(
  issue: FilterableIssue,
  search: string,
  searchDescription: boolean
): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true

  if (issue.title.toLowerCase().includes(needle)) return true
  if (issue.key.toLowerCase().includes(needle)) return true
  if (searchDescription && issue.description?.toLowerCase().includes(needle)) return true

  return false
}

/** True when the issue satisfies every active criterion. */
export function matchesIssueFilters(
  issue: FilterableIssue,
  criteria: IssueFilterCriteria,
  options: IssueFilterOptions = {}
): boolean {
  const { workItemTypeTab, searchDescription = true } = options

  if (workItemTypeTab && workItemTypeTab !== 'all' && issue.workItemType !== workItemTypeTab) {
    return false
  }

  if (criteria.type && issue.workItemType !== criteria.type) return false
  if (criteria.assigneeId && issue.assignee?.id !== criteria.assigneeId) return false
  if (criteria.priority && issue.priority !== criteria.priority) return false
  if (criteria.iterationId && issue.iteration?.id !== criteria.iterationId) return false
  if (criteria.areaId && issue.area?.id !== criteria.areaId) return false

  // Every selected label must be present — an AND, not an OR. Narrowing by two
  // labels should show items carrying both.
  if (criteria.labelIds && criteria.labelIds.length > 0) {
    const labels = issue.labels ?? []
    const hasAll = criteria.labelIds.every((labelId) =>
      labels.some((entry) => entry.label.id === labelId)
    )
    if (!hasAll) return false
  }

  if (criteria.search && !matchesSearch(issue, criteria.search, searchDescription)) {
    return false
  }

  return true
}

/** Convenience wrapper for filtering a collection. */
export function filterIssues<T extends FilterableIssue>(
  issues: T[],
  criteria: IssueFilterCriteria,
  options?: IssueFilterOptions
): T[] {
  return issues.filter((issue) => matchesIssueFilters(issue, criteria, options))
}

/** True when any criterion is active, for rendering "clear filters" affordances. */
export function hasActiveFilters(
  criteria: IssueFilterCriteria,
  options: IssueFilterOptions = {}
): boolean {
  if (options.workItemTypeTab && options.workItemTypeTab !== 'all') return true

  return Boolean(
    criteria.assigneeId ||
      criteria.priority ||
      criteria.type ||
      criteria.iterationId ||
      criteria.areaId ||
      criteria.search?.trim() ||
      (criteria.labelIds && criteria.labelIds.length > 0)
  )
}

/**
 * Translate criteria into query parameters for the server-side list endpoint,
 * so client and server filtering agree on names and semantics.
 */
export function toIssueQueryParams(
  criteria: IssueFilterCriteria,
  options: IssueFilterOptions = {}
): URLSearchParams {
  const params = new URLSearchParams()

  if (criteria.assigneeId) params.set('assigneeId', criteria.assigneeId)
  if (criteria.priority) params.set('priority', criteria.priority)
  if (criteria.iterationId) params.set('iterationId', criteria.iterationId)
  if (criteria.areaId) params.set('areaId', criteria.areaId)
  if (criteria.search?.trim()) params.set('search', criteria.search.trim())
  if (criteria.labelIds?.length) params.set('labelIds', criteria.labelIds.join(','))

  // The tab scopes the view; an explicit filter-bar type narrows further and
  // wins when both are present.
  const type =
    criteria.type ??
    (options.workItemTypeTab && options.workItemTypeTab !== 'all'
      ? options.workItemTypeTab
      : undefined)

  if (type) params.set('workItemType', type)

  return params
}
