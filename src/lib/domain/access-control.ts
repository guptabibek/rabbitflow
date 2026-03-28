import { db } from '@/lib/db'
import { cacheInvalidate, withCache } from '@/lib/redis'
import {
  hasAnyScopedPermission,
  hasPermission,
  listPermissions,
  normalizeProjectRole,
  type Permission,
  type PermissionRuleInput,
} from '@/lib/domain/rbac'

export type ProjectPermissionRuleRecord = {
  id: string
  projectId: string
  areaId: string | null
  role: string
  permission: string
  effect: string
  createdAt: Date
  updatedAt: Date
}

export async function getProjectPermissionRules(
  projectId: string
): Promise<ProjectPermissionRuleRecord[]> {
  return withCache(`acl-rules:${projectId}`, 20, async () =>
    db.projectPermissionRule.findMany({
      where: { projectId },
      orderBy: [{ areaId: 'asc' }, { role: 'asc' }, { permission: 'asc' }],
    })
  )
}

export async function invalidateProjectPermissionRuleCache(projectId: string) {
  await cacheInvalidate(`acl-rules:${projectId}`)
}

function toPermissionRules(rules: ProjectPermissionRuleRecord[]): PermissionRuleInput[] {
  return rules.map((rule) => ({
    role: rule.role,
    permission: rule.permission,
    effect: rule.effect,
    areaId: rule.areaId,
  }))
}

export async function resolveProjectPermissionSet(
  projectId: string,
  role: string | null | undefined,
  areaId?: string | null,
  extraPermissions?: string[] | null
) {
  const rules = await getProjectPermissionRules(projectId)
  return {
    rules,
    permissions: listPermissions(role, {
      rules: toPermissionRules(rules),
      areaId: areaId ?? null,
      extraPermissions,
    }),
  }
}

export async function canAccessProjectPermission(
  projectId: string,
  role: string | null | undefined,
  permission: Permission,
  options?: {
    areaId?: string | null
    allowScoped?: boolean
    extraPermissions?: string[] | null
  }
) {
  const rules = await getProjectPermissionRules(projectId)
  const permissionRules = toPermissionRules(rules)

  if (options?.allowScoped && options?.areaId === undefined) {
    return {
      granted: hasAnyScopedPermission(role, permission, permissionRules, options.extraPermissions),
      rules,
    }
  }

  return {
    granted: hasPermission(role, permission, {
      rules: permissionRules,
      areaId: options?.areaId ?? null,
      extraPermissions: options?.extraPermissions,
    }),
    rules,
  }
}

export async function getAreaAccessScope(
  projectId: string,
  role: string | null | undefined,
  permission: Permission,
  extraPermissions?: string[] | null
) {
  const [rules, areas] = await Promise.all([
    getProjectPermissionRules(projectId),
    db.area.findMany({ where: { projectId }, select: { id: true } }),
  ])

  const permissionRules = toPermissionRules(rules)
  const projectLevelAllowed = hasPermission(role, permission, {
    rules: permissionRules,
    extraPermissions,
  })
  const scopedRuleExists = rules.some(
    (rule) =>
      normalizeProjectRole(rule.role) === normalizeProjectRole(role) &&
      rule.permission === permission &&
      rule.areaId !== null
  )

  if (!scopedRuleExists) {
    return {
      rules,
      anyAllowed: projectLevelAllowed,
      unrestricted: projectLevelAllowed,
      allowUnassigned: projectLevelAllowed,
      allowedAreaIds: projectLevelAllowed ? areas.map((area) => area.id) : [],
    }
  }

  const allowedAreaIds = areas
    .filter((area) =>
      hasPermission(role, permission, {
        rules: permissionRules,
        areaId: area.id,
        extraPermissions,
      })
    )
    .map((area) => area.id)

  return {
    rules,
    anyAllowed: projectLevelAllowed || allowedAreaIds.length > 0,
    unrestricted: projectLevelAllowed && allowedAreaIds.length === areas.length,
    allowUnassigned: projectLevelAllowed,
    allowedAreaIds,
  }
}

export function applyAreaScopeFilter<T extends Record<string, unknown>>(
  where: T,
  scope: {
    unrestricted: boolean
    allowUnassigned: boolean
    allowedAreaIds: string[]
  }
): T {
  if (scope.unrestricted) {
    return where
  }

  const orClauses: Array<Record<string, unknown>> = []
  if (scope.allowedAreaIds.length > 0) {
    orClauses.push({ areaId: { in: scope.allowedAreaIds } })
  }
  if (scope.allowUnassigned) {
    orClauses.push({ areaId: null })
  }

  return {
    ...where,
    AND: [...(((where.AND as Array<Record<string, unknown>> | undefined) ?? [])), { OR: orClauses }],
  }
}