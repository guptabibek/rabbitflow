import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

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

  // Get projects the user has access to
  const userMemberships = await db.projectMember.findMany({
    where: { userId: options.userId },
    select: { projectId: true },
  })
  const accessibleProjectIds = userMemberships.map((m) => m.projectId)

  // If a specific project is requested, verify access
  if (options.projectId && !accessibleProjectIds.includes(options.projectId)) {
    return { items: [], total: 0, query }
  }

  const targetProjectIds = options.projectId
    ? [options.projectId]
    : accessibleProjectIds

  if (targetProjectIds.length === 0 && !types.includes('user')) {
    return { items: [], total: 0, query }
  }

  const results: SearchResultItem[] = []

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
  if (types.includes('user')) {
    const users = await db.user.findMany({
      where: {
        isActive: true,
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
