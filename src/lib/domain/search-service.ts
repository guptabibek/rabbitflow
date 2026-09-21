import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getAreaAccessScope } from '@/lib/domain/access-control'

// ============================================================================
// FULL-TEXT SEARCH SERVICE
// Uses PostgreSQL tsvector/tsquery for performant search across entities
// ============================================================================

export type SearchResultItem = {
  id: string
  type: 'issue' | 'comment' | 'project' | 'user' | 'document'
  title: string
  subtitle?: string | null
  description?: string | null
  url?: string | null
  projectId?: string | null
  projectKey?: string | null
  projectName?: string | null
  relevance: number
  metadata?: Record<string, unknown>
}

export type SearchResults = {
  items: SearchResultItem[]
  total: number
  query: string
}

/**
 * Transform raw user query into a safe tsquery string.
 * Splits on whitespace, strips special chars, joins with & (AND).
 */
function toTsQuery(raw: string): string {
  const terms = raw
    .replace(/[^\w\s-]/g, '')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `${t}:*`)

  return terms.join(' & ') || ''
}

/**
 * Build a LIKE pattern for fallback substring matching.
 */
function toLikePattern(raw: string): string {
  const sanitized = raw.replace(/[%_\\]/g, '\\$&').trim()
  return `%${sanitized}%`
}

type SearchMembership = {
  projectId: string
  role: string
  extraPermissions: unknown
}

type SearchAreaScope = {
  /** Projects where the caller may read every work item. */
  unrestrictedProjectIds: string[]
  /** Specific areas the caller may read in otherwise-restricted projects. */
  allowedAreaIds: string[]
  /** Projects where the caller may read work items with no area assigned. */
  unassignedProjectIds: string[]
}

/**
 * Collapse the per-project area ACLs into three flat lists that a single SQL
 * predicate can consume. Mirrors `getAreaAccessScope` + `applyAreaScopeFilter`,
 * which is what the work-item list endpoint applies.
 */
async function resolveSearchAreaScope(
  projectIds: string[],
  membershipByProject: Map<string, SearchMembership>
): Promise<SearchAreaScope> {
  const unrestrictedProjectIds: string[] = []
  const allowedAreaIds: string[] = []
  const unassignedProjectIds: string[] = []

  await Promise.all(
    projectIds.map(async (projectId) => {
      const membership = membershipByProject.get(projectId)

      const extraPermissions = Array.isArray(membership?.extraPermissions)
        ? membership.extraPermissions.filter((value): value is string => typeof value === 'string')
        : []

      const scope = await getAreaAccessScope(
        projectId,
        // A system admin reaching a project without membership is handled by the
        // caller; here an absent membership means no role, i.e. no access.
        membership?.role ?? null,
        'workitem:read',
        extraPermissions
      )

      if (scope.unrestricted) {
        unrestrictedProjectIds.push(projectId)
        return
      }

      allowedAreaIds.push(...scope.allowedAreaIds)
      if (scope.allowUnassigned) {
        unassignedProjectIds.push(projectId)
      }
    })
  )

  return { unrestrictedProjectIds, allowedAreaIds, unassignedProjectIds }
}

/**
 * Resolve a free-text query to issue ids within a single project, using the
 * `Issue.searchVector` tsvector index plus a prefix match on the issue key.
 *
 * Capped rather than paginated: this feeds a filter that the caller then paginates.
 */
export async function findIssueIdsMatchingSearch(
  projectId: string,
  query: string,
  limit = 500
): Promise<string[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const tsQuery = toTsQuery(trimmed)
  const keyPattern = `${trimmed.replace(/[%_\\]/g, '\\$&')}%`

  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT i."id"
    FROM "Issue" i
    WHERE i."projectId" = ${projectId}
      AND (
        ${tsQuery === '' ? Prisma.sql`FALSE` : Prisma.sql`i."searchVector" @@ to_tsquery('english', ${tsQuery})`}
        OR i."key" ILIKE ${keyPattern}
      )
    LIMIT ${limit}
  `)

  return rows.map((row) => row.id)
}

export async function globalSearch(
  query: string,
  options: {
    userId: string
    projectId?: string | null
    types?: string[]
    page?: number
    pageSize?: number
  }
): Promise<SearchResults> {
  const page = options.page ?? 1
  const pageSize = Math.min(options.pageSize ?? 20, 50)
  const offset = (page - 1) * pageSize
  const types = options.types ?? ['issue', 'comment', 'project', 'user', 'document']
  const tsQuery = toTsQuery(query)
  const likePattern = toLikePattern(query)

  if (!query.trim()) {
    return { items: [], total: 0, query }
  }

  // Get projects the user has access to, with the role needed for area scoping.
  const userMemberships = await db.projectMember.findMany({
    where: { userId: options.userId },
    select: { projectId: true, role: true, extraPermissions: true },
  })
  const accessibleProjectIds = userMemberships.map((m) => m.projectId)
  const membershipByProject = new Map(
    userMemberships.map((membership) => [membership.projectId, membership])
  )

  // If a specific project is requested, verify access
  if (options.projectId && !accessibleProjectIds.includes(options.projectId)) {
    return { items: [], total: 0, query }
  }

  const targetProjectIds = options.projectId
    ? [options.projectId]
    : accessibleProjectIds

  // Every searchable entity — users included — is now scoped to the caller's
  // projects, so a caller with no memberships has nothing to search.
  if (targetProjectIds.length === 0) {
    return { items: [], total: 0, query }
  }

  const results: SearchResultItem[] = []

  // Area-level ACLs must apply here exactly as they do on /api/issues. Without
  // this, a user restricted to a subset of area paths could read the titles and
  // descriptions of work items in areas they are denied, simply by searching for
  // them — the ACL was enforced on the list endpoint but not on search.
  const areaScope = await resolveSearchAreaScope(targetProjectIds, membershipByProject)

  if (
    areaScope.unrestrictedProjectIds.length === 0 &&
    areaScope.allowedAreaIds.length === 0 &&
    areaScope.unassignedProjectIds.length === 0
  ) {
    return { items: [], total: 0, query }
  }

  // === ISSUE SEARCH (tsvector) ===
  if (types.includes('issue') && targetProjectIds.length > 0 && tsQuery) {
    const issues = await db.$queryRaw<
      Array<{
        id: string
        key: string
        title: string
        status: string
        workItemType: string
        projectId: string
        projectKey: string
        projectName: string
        description: string | null
        rank: number
      }>
    >(Prisma.sql`
      SELECT
        i."id", i."key", i."title", i."status", i."workItemType",
        i."projectId", p."key" AS "projectKey", p."name" AS "projectName",
        LEFT(i."description", 200) AS "description",
        ts_rank(i."searchVector", to_tsquery('english', ${tsQuery})) AS "rank"
      FROM "Issue" i
      JOIN "Project" p ON p."id" = i."projectId"
      WHERE i."projectId" = ANY(${targetProjectIds})
        AND i."searchVector" @@ to_tsquery('english', ${tsQuery})
        AND (
          i."projectId" = ANY(${areaScope.unrestrictedProjectIds})
          OR i."areaId" = ANY(${areaScope.allowedAreaIds})
          OR (i."areaId" IS NULL AND i."projectId" = ANY(${areaScope.unassignedProjectIds}))
        )
      ORDER BY "rank" DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `)

    for (const issue of issues) {
      results.push({
        id: issue.id,
        type: 'issue',
        title: `${issue.key}: ${issue.title}`,
        subtitle: issue.status,
        description: issue.description,
        url: `/work-items/${issue.id}`,
        projectId: issue.projectId,
        projectKey: issue.projectKey,
        projectName: issue.projectName,
        relevance: issue.rank,
        metadata: { workItemType: issue.workItemType, status: issue.status },
      })
    }
  }

  // === COMMENT SEARCH (tsvector) ===
  if (types.includes('comment') && targetProjectIds.length > 0 && tsQuery) {
    const comments = await db.$queryRaw<
      Array<{
        id: string
        content: string
        issueId: string
        issueKey: string
        issueTitle: string
        projectId: string
        projectKey: string
        authorName: string
        rank: number
      }>
    >(Prisma.sql`
      SELECT
        c."id", LEFT(c."content", 200) AS "content",
        i."id" AS "issueId", i."key" AS "issueKey", i."title" AS "issueTitle",
        i."projectId", p."key" AS "projectKey",
        u."name" AS "authorName",
        ts_rank(c."searchVector", to_tsquery('english', ${tsQuery})) AS "rank"
      FROM "Comment" c
      JOIN "Issue" i ON i."id" = c."issueId"
      JOIN "Project" p ON p."id" = i."projectId"
      JOIN "User" u ON u."id" = c."authorId"
      WHERE i."projectId" = ANY(${targetProjectIds})
        AND c."searchVector" @@ to_tsquery('english', ${tsQuery})
        -- Comments inherit the area ACL of the work item they hang off, so the
        -- same predicate applies here: otherwise a restricted area's discussion
        -- would leak even though the work item itself is filtered out.
        AND (
          i."projectId" = ANY(${areaScope.unrestrictedProjectIds})
          OR i."areaId" = ANY(${areaScope.allowedAreaIds})
          OR (i."areaId" IS NULL AND i."projectId" = ANY(${areaScope.unassignedProjectIds}))
        )
      ORDER BY "rank" DESC
      LIMIT ${Math.ceil(pageSize / 2)}
    `)

    for (const comment of comments) {
      results.push({
        id: comment.id,
        type: 'comment',
        title: `Comment on ${comment.issueKey}`,
        subtitle: `by ${comment.authorName}`,
        description: comment.content,
        url: `/work-items/${comment.issueId}`,
        projectId: comment.projectId,
        projectKey: comment.projectKey,
        relevance: comment.rank * 0.8, // Slightly lower weight than issues
      })
    }
  }

  // === PROJECT SEARCH (ILIKE fallback) ===
  if (types.includes('project') && accessibleProjectIds.length > 0) {
    const projects = await db.project.findMany({
      where: {
        id: { in: accessibleProjectIds },
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { key: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, key: true, name: true, description: true, color: true },
      take: 5,
    })

    for (const project of projects) {
      results.push({
        id: project.id,
        type: 'project',
        title: project.name,
        subtitle: project.key,
        description: project.description,
        url: `/projects`,
        projectId: project.id,
        projectKey: project.key,
        projectName: project.name,
        relevance: 0.9,
      })
    }
  }

  // === USER SEARCH (ILIKE) ===
  // Scoped to users who share at least one project with the caller. Without this
  // filter any authenticated account — including one created through self-service
  // registration with zero memberships — could enumerate the entire staff
  // directory, names and email addresses included, by searching the corporate
  // email domain.
  if (types.includes('user') && targetProjectIds.length > 0) {
    const users = await db.user.findMany({
      where: {
        isActive: true,
        projectMemberships: {
          some: { projectId: { in: targetProjectIds } },
        },
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true, avatar: true },
      take: 5,
    })

    for (const user of users) {
      results.push({
        id: user.id,
        type: 'user',
        title: user.name,
        subtitle: user.email,
        url: undefined,
        relevance: 0.7,
      })
    }
  }

  // === DOCUMENT SEARCH (tsvector) ===
  if (types.includes('document') && targetProjectIds.length > 0 && tsQuery) {
    const docs = await db.$queryRaw<
      Array<{
        id: string
        title: string
        content: string
        projectId: string
        projectKey: string
        rank: number
      }>
    >(Prisma.sql`
      SELECT
        d."id", d."title", LEFT(d."content", 200) AS "content",
        d."projectId", p."key" AS "projectKey",
        ts_rank(d."searchVector", to_tsquery('english', ${tsQuery})) AS "rank"
      FROM "Document" d
      JOIN "Project" p ON p."id" = d."projectId"
      WHERE d."projectId" = ANY(${targetProjectIds})
        AND d."searchVector" @@ to_tsquery('english', ${tsQuery})
      ORDER BY "rank" DESC
      LIMIT ${Math.ceil(pageSize / 2)}
    `)

    for (const doc of docs) {
      results.push({
        id: doc.id,
        type: 'document',
        title: doc.title,
        description: doc.content,
        url: `/documents/${doc.id}`,
        projectId: doc.projectId,
        projectKey: doc.projectKey,
        relevance: doc.rank * 0.85,
      })
    }
  }

  // Sort by relevance
  results.sort((a, b) => b.relevance - a.relevance)

  return {
    items: results.slice(0, pageSize),
    total: results.length,
    query,
  }
}
