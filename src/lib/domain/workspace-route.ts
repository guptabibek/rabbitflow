export const WORKSPACE_VIEWS = [
  'dashboard',
  'backlog',
  'board',
  'sprints',
  'list',
  'reports',
  'roadmap',
  'portfolio',
  'calendar',
  'dependency-graph',
  'activity',
  'teams',
  'documents',
  'objectives',
  'retrospectives',
  'approvals',
  'webhooks',
  'automations',
  'imports',
  'recurring-tasks',
  'test-plans',
  'sla',
  'api-tokens',
  'branding',
  'acl',
  'onboarding-config',
] as const

export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number]

export function isWorkspaceView(value: string): value is WorkspaceView {
  return (WORKSPACE_VIEWS as readonly string[]).includes(value)
}

export function workspaceViewFromSlug(slug: string): WorkspaceView | null {
  if (slug === 'overview') return 'dashboard'
  return isWorkspaceView(slug) ? slug : null
}

export function workspaceViewSlug(view: WorkspaceView) {
  return view === 'dashboard' ? 'overview' : view
}

/**
 * Build the durable URL for a project view.
 *
 * Existing query parameters are retained because views use them for filters
 * and selection state. The legacy `view` parameter is removed once the view
 * is represented by the path.
 */
export function canonicalWorkspaceRoute(
  projectId: string,
  view: WorkspaceView,
  search: string | URLSearchParams = ''
) {
  const params = new URLSearchParams(search)
  params.delete('view')
  const query = params.toString()
  const path = `/projects/${encodeURIComponent(projectId)}/${workspaceViewSlug(view)}`
  return query ? `${path}?${query}` : path
}

export function parseWorkspacePathname(pathname: string): {
  projectId: string
  view: WorkspaceView
} | null {
  const match = /^\/projects\/([^/]+)\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null

  const view = workspaceViewFromSlug(match[2])
  if (!view) return null

  try {
    const projectId = decodeURIComponent(match[1])
    return projectId ? { projectId, view } : null
  } catch {
    return null
  }
}
