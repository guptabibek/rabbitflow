// Pure state-category functions extracted for testability (no @/ imports)
// Re-exported by state-machine.ts

export type WorkItemStateCategory = 'New' | 'In Progress' | 'Done'

export function normalizeStateCategory(category: string): WorkItemStateCategory {
  if (category === 'Done' || category === 'Completed' || category === 'Resolved') {
    return 'Done'
  }

  if (category === 'In Progress' || category === 'InProgress') {
    return 'In Progress'
  }

  return 'New'
}

export function statusFromStateCategory(category: string): string {
  const normalized = normalizeStateCategory(category)

  if (normalized === 'Done') {
    return 'done'
  }

  if (normalized === 'In Progress') {
    return 'in_progress'
  }

  return 'backlog'
}
