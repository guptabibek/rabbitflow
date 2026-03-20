export type AgileProjectRole = 'Admin' | 'PM' | 'Dev' | 'QA' | 'Viewer'

export type Permission =
  | 'project:create'
  | 'project:read'
  | 'project:update'
  | 'masterdata:manage'
  | 'project:members:manage'
  | 'workitem:read'
  | 'workitem:create'
  | 'workitem:update'
  | 'workitem:delete'
  | 'workitem:assign'
  | 'workitem:comment'
  | 'workitem:link'
  | 'workitem:transition'
  | 'backlog:reorder'
  | 'sprint:manage'
  | 'board:update'

export const ROLE_PERMISSIONS: Record<AgileProjectRole, Set<Permission>> = {
  Admin: new Set<Permission>([
    'project:create',
    'project:read',
    'project:update',
    'masterdata:manage',
    'project:members:manage',
    'workitem:read',
    'workitem:create',
    'workitem:update',
    'workitem:delete',
    'workitem:assign',
    'workitem:comment',
    'workitem:link',
    'workitem:transition',
    'backlog:reorder',
    'sprint:manage',
    'board:update',
  ]),
  PM: new Set<Permission>([
    'project:read',
    'workitem:read',
    'workitem:create',
    'workitem:update',
    'workitem:assign',
    'workitem:comment',
    'workitem:link',
    'workitem:transition',
    'backlog:reorder',
    'sprint:manage',
    'board:update',
  ]),
  Dev: new Set<Permission>([
    'project:read',
    'workitem:read',
    'workitem:create',
    'workitem:update',
    'workitem:assign',
    'workitem:comment',
    'workitem:link',
    'workitem:transition',
    'board:update',
  ]),
  QA: new Set<Permission>([
    'project:read',
    'workitem:read',
    'workitem:update',
    'workitem:comment',
    'workitem:link',
    'workitem:transition',
    'board:update',
  ]),
  Viewer: new Set<Permission>([
    'project:read',
    'workitem:read',
  ]),
}

const LEGACY_ROLE_MAP: Record<string, AgileProjectRole> = {
  owner: 'Admin',
  admin: 'Admin',
  member: 'Dev',
  Admin: 'Admin',
  PM: 'PM',
  Dev: 'Dev',
  QA: 'QA',
  Viewer: 'Viewer',
}

export function normalizeProjectRole(role: string | null | undefined): AgileProjectRole {
  if (!role) return 'Viewer'
  return LEGACY_ROLE_MAP[role] ?? 'Viewer'
}

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  const normalized = normalizeProjectRole(role)
  return ROLE_PERMISSIONS[normalized].has(permission)
}

export function listPermissions(role: string | null | undefined): Permission[] {
  const normalized = normalizeProjectRole(role)
  return Array.from(ROLE_PERMISSIONS[normalized])
}
