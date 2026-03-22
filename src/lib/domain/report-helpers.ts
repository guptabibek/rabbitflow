// Pure utility functions for reports – no Prisma/Redis dependency so they're testable in isolation

/**
 * Convert an array of flat issue objects to CSV text.
 */
export function issuesToCsv(issues: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return ''
    let str = String(val)

    // Prevent CSV injection when opened in spreadsheet tools.
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`
    }

    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const header = columns.join(',')
  const rows = issues.map((issue) => columns.map((col) => escape(issue[col])).join(','))
  return [header, ...rows].join('\n')
}

/**
 * Derive project health rating from progress and bug ratio.
 */
export function getProjectHealth(
  total: number,
  done: number,
  inProgress: number,
  openBugs: number,
): 'healthy' | 'at-risk' | 'critical' {
  if (total === 0) return 'healthy'
  const progress = done / total
  const bugRatio = openBugs / total

  if (bugRatio > 0.3 || (progress < 0.1 && inProgress === 0)) return 'critical'
  if (bugRatio > 0.15 || progress < 0.3) return 'at-risk'
  return 'healthy'
}

/**
 * Compute percentile value from a sorted array.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

/**
 * Compute median value from a sorted array.
 */
export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : sorted[mid]
}
