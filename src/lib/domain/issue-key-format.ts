function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function formatProjectIssueKey(projectKey: string, issueNumber: number) {
  return `${projectKey}-${issueNumber}`
}

/**
 * Order issue keys naturally: RABBIT-2 before RABBIT-10.
 *
 * A plain `localeCompare` sorts these as strings, producing
 * `RABBIT-1, RABBIT-10, RABBIT-11, RABBIT-2, …`, which makes the key column
 * useless once a project passes nine work items.
 */
export function compareIssueKeys(a: string, b: string): number {
  const parse = (key: string) => {
    const separator = key.lastIndexOf('-')
    if (separator === -1) return { prefix: key, number: Number.NaN }

    const number = Number.parseInt(key.slice(separator + 1), 10)
    return { prefix: key.slice(0, separator), number }
  }

  const left = parse(a)
  const right = parse(b)

  const prefixComparison = left.prefix.localeCompare(right.prefix)
  if (prefixComparison !== 0) return prefixComparison

  // Keys that do not end in a number fall back to whole-string comparison so
  // ordering stays stable rather than arbitrary.
  if (Number.isNaN(left.number) || Number.isNaN(right.number)) {
    return a.localeCompare(b)
  }

  return left.number - right.number
}

export function extractProjectIssueNumber(issueKey: string, projectKey: string) {
  const match = new RegExp(`^${escapeRegex(projectKey)}-(\\d+)$`).exec(issueKey)
  if (!match) {
    return null
  }

  const issueNumber = Number.parseInt(match[1], 10)
  return Number.isFinite(issueNumber) ? issueNumber : null
}