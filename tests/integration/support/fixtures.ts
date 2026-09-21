import { NextRequest } from 'next/server'
import { db } from './db.ts'
import { signToken } from '../../../src/lib/auth.ts'
import { provisionProjectSystemRecords } from '../../../src/lib/domain/project-bootstrap.ts'

/**
 * Fixture builders for integration tests.
 *
 * Every helper returns real database rows, and `authedRequest` produces a
 * request carrying a genuinely signed JWT plus a live AuthSession row — so the
 * full auth pipeline (token verification, session revocation check, user-active
 * check, membership lookup, ACL resolution) executes exactly as it does in
 * production. Nothing here stubs authorization.
 */

export type SeededUser = {
  id: string
  email: string
  sessionId: string
  token: string
}

let counter = 0
function unique(prefix: string) {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

export async function createUser(options?: {
  globalRole?: string
  isActive?: boolean
  email?: string
}): Promise<SeededUser> {
  const email = options?.email ?? `${unique('user')}@test.local`

  const user = await db.user.create({
    data: {
      email,
      name: email.split('@')[0],
      // bcrypt hash of "Password123!" — tests that need a login go through the
      // real route; this is only for rows that must have some credential.
      passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewuKuz0Q0PmuWFPC',
      globalRole: options?.globalRole ?? 'member',
      isActive: options?.isActive ?? true,
    },
  })

  const session = await db.authSession.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      deviceLabel: 'integration-test',
    },
    select: { id: true },
  })

  const token = await signToken(user.id, session.id, user.globalRole)

  return { id: user.id, email: user.email, sessionId: session.id, token }
}

export async function createProject(options?: { key?: string; name?: string }) {
  const key = options?.key ?? unique('T').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)

  const project = await db.project.create({
    data: {
      key,
      name: options?.name ?? `Project ${key}`,
    },
  })

  // Provision states, areas, teams and work-item types the same way the
  // application does, so tests exercise the real schema rather than a
  // hand-rolled subset.
  await provisionProjectSystemRecords(project.id)

  return project
}

export async function addMember(projectId: string, userId: string, role: string) {
  return db.projectMember.create({ data: { projectId, userId, role } })
}

export async function createIssue(options: {
  projectId: string
  reporterId: string
  title?: string
  status?: string
  areaId?: string | null
  workItemType?: string
}) {
  const count = await db.issue.count({ where: { projectId: options.projectId } })
  const project = await db.project.findUniqueOrThrow({
    where: { id: options.projectId },
    select: { key: true },
  })

  return db.issue.create({
    data: {
      projectId: options.projectId,
      key: `${project.key}-${count + 1}`,
      title: options.title ?? `Issue ${count + 1}`,
      workItemType: options.workItemType ?? 'task',
      status: options.status ?? 'backlog',
      reporterId: options.reporterId,
      areaId: options.areaId ?? null,
    },
  })
}

const BASE_URL = 'http://localhost:3000'

/**
 * Build a request authenticated as `user`, carrying the signed JWT in the
 * auth-token cookie exactly as a browser would.
 */
export function authedRequest(
  user: SeededUser | null,
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
): NextRequest {
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined) headers.set('content-type', 'application/json')
  if (user) headers.set('cookie', `auth-token=${user.token}`)

  return new NextRequest(new URL(path, BASE_URL), {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

/** Request carrying a bearer API token instead of a session cookie. */
export function tokenRequest(
  apiToken: string,
  path: string,
  init?: { method?: string; body?: unknown }
): NextRequest {
  const headers = new Headers({ authorization: `Bearer ${apiToken}` })
  if (init?.body !== undefined) headers.set('content-type', 'application/json')

  return new NextRequest(new URL(path, BASE_URL), {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

/** Read a route handler's JSON response alongside its status. */
export async function readResponse<T = unknown>(response: Response) {
  const text = await response.text()
  let body: T | null = null
  try {
    body = text ? (JSON.parse(text) as T) : null
  } catch {
    body = null
  }
  return { status: response.status, body }
}
