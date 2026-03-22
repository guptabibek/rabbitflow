function normalizeBaseUrl(baseInput: string | URL): URL {
  const raw = typeof baseInput === 'string' ? baseInput : baseInput.toString()
  const normalizedUrl = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  const base = new URL(normalizedUrl)
  if (!base.pathname.endsWith('/')) {
    base.pathname = `${base.pathname}/`
  }
  return base
}

export function workItemPath(issueId: string) {
  return `/work-items/${encodeURIComponent(issueId)}`
}

export function getConfiguredAppBaseUrl() {
  const configuredUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (!configuredUrl) {
    throw new Error('APP_URL (or NEXT_PUBLIC_APP_URL) is not configured')
  }

  try {
    return normalizeBaseUrl(configuredUrl)
  } catch {
    throw new Error('APP_URL (or NEXT_PUBLIC_APP_URL) must be a valid absolute URL')
  }
}

export function workItemUrl(issueId: string, baseUrl?: string | URL) {
  const base =
    baseUrl !== undefined
      ? normalizeBaseUrl(baseUrl)
      : typeof window !== 'undefined'
        ? normalizeBaseUrl(window.location.origin)
        : getConfiguredAppBaseUrl()

  return new URL(workItemPath(issueId).replace(/^\//, ''), base).toString()
}