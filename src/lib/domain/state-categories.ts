// Pure state-category functions extracted for testability (no @/ imports)
// Re-exported by state-machine.ts

export const STATE_CATEGORY_OPTIONS = ['Proposed', 'In Progress', 'Completed'] as const

export type WorkItemStateCategory = (typeof STATE_CATEGORY_OPTIONS)[number]

export function normalizeStateCategory(category: string): WorkItemStateCategory {
  const normalized = category.trim()

  if (normalized === 'Done' || normalized === 'Completed' || normalized === 'Resolved') {
    return 'Completed'
  }

  if (normalized === 'In Progress' || normalized === 'InProgress') {
    return 'In Progress'
  }

  return 'Proposed'
}

export function isFinalStateCategory(category: string): boolean {
  return normalizeStateCategory(category) === 'Completed'
}

export function statusFromStateCategory(category: string): string {
  const normalized = normalizeStateCategory(category)

  if (normalized === 'Completed') {
    return 'done'
  }

  if (normalized === 'In Progress') {
    return 'in_progress'
  }

  return 'backlog'
}
