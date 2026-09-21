import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db, resetDatabase, disconnect } from './support/db.ts'
import {
  addMember,
  authedRequest,
  createIssue,
  createProject,
  createUser,
  readResponse,
  tokenRequest,
  type SeededUser,
} from './support/fixtures.ts'
import { generateApiToken } from '../../src/lib/domain/api-token.ts'

import { GET as issuesGet, POST as issuesPost } from '../../src/app/api/issues/route.ts'

/**
 * API token authentication.
 *
 * Tokens were generated, hashed and surfaced in a full management UI, but no
 * code anywhere validated them — there was no bearer handling and `scopes` was
 * enforced nowhere. These tests exist so that cannot silently regress to a
 * decorative feature again.
 */

let project: Awaited<ReturnType<typeof createProject>>
let owner: SeededUser

async function issueToken(options: {
  userId: string
  scopes: string[]
  expiresAt?: Date | null
  isRevoked?: boolean
}) {
  const { token, prefix, tokenHash } = generateApiToken()

  await db.apiToken.create({
    data: {
      userId: options.userId,
      name: `token-${prefix}`,
      tokenPrefix: prefix,
      tokenHash,
      scopes: options.scopes,
      expiresAt: options.expiresAt ?? null,
      isRevoked: options.isRevoked ?? false,
    },
  })

  return token
}

before(async () => {
  await resetDatabase()
  project = await createProject({ key: 'TOKENS' })
  owner = await createUser()
  await addMember(project.id, owner.id, 'Admin')
})

after(async () => {
  await disconnect()
})

beforeEach(async () => {
  await db.apiToken.deleteMany({})
  await db.issue.deleteMany({})
})

test('a read token authenticates a GET', async () => {
  const token = await issueToken({ userId: owner.id, scopes: ['read'] })
  await createIssue({ projectId: project.id, reporterId: owner.id })

  const res = await readResponse<unknown[]>(
    await issuesGet(tokenRequest(token, `/api/issues?projectId=${project.id}&minimal=true`))
  )

  assert.equal(res.status, 200)
  assert.equal(res.body?.length, 1)
})

test('a read token cannot write', async () => {
  const token = await issueToken({ userId: owner.id, scopes: ['read'] })

  const res = await readResponse<{ code: string }>(
    await issuesPost(
      tokenRequest(token, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'Should not exist',
          workItemType: 'task',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.equal(res.status, 403)
  assert.equal(res.body?.code, 'TOKEN_SCOPE_INSUFFICIENT')
  assert.equal(await db.issue.count(), 0)
})

test('a write token can write', async () => {
  const token = await issueToken({ userId: owner.id, scopes: ['read', 'write'] })

  const res = await readResponse(
    await issuesPost(
      tokenRequest(token, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'Created by token',
          workItemType: 'task',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.equal(res.status, 201)
  assert.equal(await db.issue.count(), 1)
})

test('an unknown token is rejected', async () => {
  const res = await readResponse(
    await issuesGet(
      tokenRequest('rf_deadbeef_0000000000000000', `/api/issues?projectId=${project.id}`)
    )
  )

  assert.equal(res.status, 401)
})

test('a malformed bearer value is rejected', async () => {
  const res = await readResponse(
    await issuesGet(tokenRequest('not-a-token-at-all', `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 401)
})

test('a revoked token is rejected', async () => {
  const token = await issueToken({ userId: owner.id, scopes: ['read'], isRevoked: true })

  const res = await readResponse(
    await issuesGet(tokenRequest(token, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 401)
})

test('an expired token is rejected', async () => {
  const token = await issueToken({
    userId: owner.id,
    scopes: ['read'],
    expiresAt: new Date(Date.now() - 60_000),
  })

  const res = await readResponse(
    await issuesGet(tokenRequest(token, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 401)
})

test('a token belonging to a deactivated user is rejected', async () => {
  const token = await issueToken({ userId: owner.id, scopes: ['read'] })
  await db.user.update({
    where: { id: owner.id },
    data: { isActive: false, deactivatedAt: new Date() },
  })

  const res = await readResponse(
    await issuesGet(tokenRequest(token, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 401)

  await db.user.update({
    where: { id: owner.id },
    data: { isActive: true, deactivatedAt: null },
  })
})

test('a token cannot exceed its owner permissions', async () => {
  // A token is not a privilege grant: it acts as its owner, so a token held by
  // someone with no access to a project reaches nothing there.
  const stranger = await createUser()
  const token = await issueToken({ userId: stranger.id, scopes: ['read', 'write'] })

  const res = await readResponse(
    await issuesGet(tokenRequest(token, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 403)
})

test('using a token records lastUsedAt', async () => {
  const token = await issueToken({ userId: owner.id, scopes: ['read'] })

  const before = await db.apiToken.findFirstOrThrow({ where: { userId: owner.id } })
  assert.equal(before.lastUsedAt, null)

  await issuesGet(tokenRequest(token, `/api/issues?projectId=${project.id}`))

  const after = await db.apiToken.findFirstOrThrow({ where: { id: before.id } })
  assert.notEqual(after.lastUsedAt, null, 'lastUsedAt could never populate before bearer auth existed')
})

test('the raw token is never stored', async () => {
  const token = await issueToken({ userId: owner.id, scopes: ['read'] })

  const stored = await db.apiToken.findFirstOrThrow({ where: { userId: owner.id } })
  assert.notEqual(stored.tokenHash, token)
  assert.equal(stored.tokenHash.length, 64, 'tokenHash should be a SHA-256 hex digest')
  // The prefix is a non-secret identifier and may be stored in the clear.
  assert.ok(token.startsWith(stored.tokenPrefix))
})

test('a session cookie still works alongside bearer support', async () => {
  await createIssue({ projectId: project.id, reporterId: owner.id })

  const res = await readResponse<unknown[]>(
    await issuesGet(authedRequest(owner, `/api/issues?projectId=${project.id}&minimal=true`))
  )

  assert.equal(res.status, 200)
  assert.equal(res.body?.length, 1)
})
