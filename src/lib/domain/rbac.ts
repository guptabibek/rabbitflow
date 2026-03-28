export type AgileProjectRole = 'Admin' | 'PM' | 'DevOps' | 'Dev' | 'QA' | 'Viewer'

export const ALL_PERMISSIONS = [
  'project:create',
  'project:read',
  'project:update',
  'project:settings',
  'roadmap:read',
  'portfolio:read',
  'calendar:read',
  'dependency:read',
  'activity:read',
  'collaboration:read',
  'operations:manage',
  'branding:manage',
  'test:manage',
  'onboarding:manage',
  'acl:manage',
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
] as const

export type Permission = (typeof ALL_PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<AgileProjectRole, Set<Permission>> = {
  Admin: new Set<Permission>([
    'project:create',
    'project:read',
    'project:update',
    'project:settings',
    'roadmap:read',
    'portfolio:read',
    'calendar:read',
    'dependency:read',
    'activity:read',
    'collaboration:read',
    'operations:manage',
    'branding:manage',
    'test:manage',
    'onboarding:manage',
    'acl:manage',
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
    'project:settings',
    'roadmap:read',
    'portfolio:read',
    'calendar:read',
    'dependency:read',
    'activity:read',
    'collaboration:read',
    'test:manage',
    'onboarding:manage',
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
  DevOps: new Set<Permission>([
    'project:read',
    'project:settings',
    'roadmap:read',
    'portfolio:read',
    'calendar:read',
    'dependency:read',
    'activity:read',
    'collaboration:read',
    'operations:manage',
    'branding:manage',
    'test:manage',
    'workitem:read',
    'workitem:comment',
  ]),
  Dev: new Set<Permission>([
    'project:read',
    'roadmap:read',
    'portfolio:read',
    'calendar:read',
    'dependency:read',
    'activity:read',
    'collaboration:read',
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
    'roadmap:read',
    'portfolio:read',
    'calendar:read',
    'dependency:read',
    'activity:read',
    'collaboration:read',
    'test:manage',
    'workitem:read',
    'workitem:update',
    'workitem:comment',
    'workitem:link',
    'workitem:transition',
    'board:update',
  ]),
  Viewer: new Set<Permission>([
    'project:read',
    'roadmap:read',
    'portfolio:read',
    'calendar:read',
    'dependency:read',
    'activity:read',
    'collaboration:read',
    'workitem:read',
  ]),
}

export type PermissionRuleInput = {
  role: string
  permission: string
  effect: string
  areaId?: string | null
}

const LEGACY_ROLE_MAP: Record<string, AgileProjectRole> = {
  owner: 'Admin',
  admin: 'Admin',
  member: 'Dev',
  Admin: 'Admin',
  PM: 'PM',
  DevOps: 'DevOps',
  Dev: 'Dev',
  QA: 'QA',
  Viewer: 'Viewer',
}

export function normalizeProjectRole(role: string | null | undefined): AgileProjectRole {
  if (!role) return 'Viewer'
  return LEGACY_ROLE_MAP[role] ?? 'Viewer'
}

function normalizePermissionRuleRole(role: string): AgileProjectRole {
  return normalizeProjectRole(role)
}

function getMatchingRules(
  role: string | null | undefined,
  permission: Permission,
  rules: PermissionRuleInput[],
  areaId: string | null
) {
  const normalizedRole = normalizeProjectRole(role)

  return rules.filter((rule) => {
    if (normalizePermissionRuleRole(rule.role) !== normalizedRole) return false
    if (rule.permission !== permission) return false
    return (rule.areaId ?? null) === areaId
  })
}

export function hasPermission(
  role: string | null | undefined,
  permission: Permission,
  options?: {
    rules?: PermissionRuleInput[]
    areaId?: string | null
    extraPermissions?: string[] | null
  }
): boolean {
  const normalized = normalizeProjectRole(role)
  let granted = ROLE_PERMISSIONS[normalized].has(permission)

  if (!granted && options?.extraPermissions?.includes(permission)) {
    granted = true
  }

  const rules = options?.rules ?? []
  if (rules.length === 0) return granted

  const projectRules = getMatchingRules(role, permission, rules, null)
  for (const rule of projectRules) {
    granted = rule.effect === 'allow'
  }

  const scopedAreaId = options?.areaId ?? null
  if (!scopedAreaId) return granted

  const areaRules = getMatchingRules(role, permission, rules, scopedAreaId)
  for (const rule of areaRules) {
    granted = rule.effect === 'allow'
  }

  return granted
}

export function hasAnyScopedPermission(
  role: string | null | undefined,
  permission: Permission,
  rules: PermissionRuleInput[],
  extraPermissions?: string[] | null
): boolean {
  if (hasPermission(role, permission, { rules, extraPermissions })) return true

  const normalizedRole = normalizeProjectRole(role)
  return rules.some(
    (rule) =>
      normalizePermissionRuleRole(rule.role) === normalizedRole &&
      rule.permission === permission &&
      Boolean(rule.areaId) &&
      hasPermission(role, permission, {
        rules,
        areaId: rule.areaId ?? null,
        extraPermissions,
      })
  )
}

export function listPermissions(
  role: string | null | undefined,
  options?: {
    rules?: PermissionRuleInput[]
    areaId?: string | null
    extraPermissions?: string[] | null
  }
): Permission[] {
  const normalized = normalizeProjectRole(role)
  const basePermissions = new Set<Permission>(ROLE_PERMISSIONS[normalized])
  for (const permission of options?.extraPermissions ?? []) {
    if ((ALL_PERMISSIONS as readonly string[]).includes(permission)) {
      basePermissions.add(permission as Permission)
    }
  }
  const rules = options?.rules ?? []

  const allPermissions = Array.from(basePermissions)

  if (rules.length === 0) return allPermissions

  return allPermissions.filter((permission) =>
    hasPermission(role, permission, {
      rules,
      areaId: options?.areaId ?? null,
      extraPermissions: options?.extraPermissions,
    })
  )
}
