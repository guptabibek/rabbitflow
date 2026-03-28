function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function formatProjectIssueKey(projectKey: string, issueNumber: number) {
  return `${projectKey}-${issueNumber}`
}

export function extractProjectIssueNumber(issueKey: string, projectKey: string) {
  const match = new RegExp(`^${escapeRegex(projectKey)}-(\\d+)$`).exec(issueKey)
  if (!match) {
    return null
  }

  const issueNumber = Number.parseInt(match[1], 10)
  return Number.isFinite(issueNumber) ? issueNumber : null
}