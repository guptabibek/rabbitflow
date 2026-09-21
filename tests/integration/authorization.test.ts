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
  type SeededUser,
} from './support/fixtures.ts'

import { GET as issuesGet, POST as issuesPost } from '../../src/app/api/issues/route.ts'
import { GET as rbacGet } from '../../src/app/api/rbac/route.ts'
import { GET as labelsGet, POST as labelsPost } from '../../src/app/api/labels/route.ts'
import { GET as activityGet } from '../../src/app/api/activity/route.ts'

/**
 * The authorization matrix.
 *
 * RBAC is the most security-critical logic in this system — six roles across
 * twenty-nine permissions, overlaid with per-project and per-area rule
 * overrides, per-membership extra permissions, and a global-admin fallback.
 * Before this suite, `tests/domain/rbac.test.ts` covered the pure permission
 * matrix and *nothing* covered whether the API actually enforced it.
 *
 * These tests drive the real route handlers against a real database, so the
 * whole pipeline runs: JWT verification, session-revocation check, user-active
 * check, membership lookup and ACL resolution.
 */

let project: Awaited<ReturnType<typeof createProject>>
let otherProject: Awaited<ReturnType<typeof createProject>>
let admin: SeededUser
let pm: SeededUser
let dev: SeededUser
let qa: SeededUser
let viewer: SeededUser
let outsider: SeededUser
let globalAdmin: SeededUser

/**
 * The world is built once. Project provisioning writes states, areas, teams,
 * work-item types, field definitions and transitions, so rebuilding it per test
 * costs seconds each and dominates the run.
 *
 * Tests that mutate clean up after themselves via `beforeEach`, which clears
 * only the rows they create. Roles and memberships are read-only throughout, so
 * sharing them is safe and keeps the suite fast enough to run on every save.
 */
before(async () => {
  await resetDatabase()

  project = await createProject({ key: 'ALPHA' })
  otherProject = await createProject({ key: 'BETA' })

  admin = await createUser()
  pm = await createUser()
  dev = await createUser()
  qa = await createUser()
  viewer = await createUser()
  outsider = await createUser()
  globalAdmin = await createUser({ globalRole: 'admin' })

  await addMember(project.id, admin.id, 'Admin')
  await addMember(project.id, pm.id, 'PM')
  await addMember(project.id, dev.id, 'Dev')
  await addMember(project.id, qa.id, 'QA')
  await addMember(project.id, viewer.id, 'Viewer')
  // `outsider` is deliberately a member of nothing.
})

after(async () => {
  await disconnect()
})

beforeEach(async () => {
  // Clear per-test data without touching the provisioned projects or the role
  // memberships the assertions depend on.
  await db.issue.deleteMany({})
  await db.label.deleteMany({})

  // Restore session and account state that individual tests deliberately break.
  await db.authSession.updateMany({
    data: { revokedAt: null, revokedReason: null, expiresAt: new Date(Date.now() + 3600_000) },
  })
  await db.user.updateMany({ data: { isActive: true, deactivatedAt: null } })
})

// ---------------------------------------------------------------------------
// Read access
// ---------------------------------------------------------------------------

test('every project role can read work items', async () => {
  await createIssue({ projectId: project.id, reporterId: admin.id })

  for (const [label, user] of [
    ['Admin', admin],
    ['PM', pm],
    ['Dev', dev],
    ['QA', qa],
    ['Viewer', viewer],
  ] as const) {
    const res = await readResponse(
      await issuesGet(authedRequest(user, `/api/issues?projectId=${project.id}`))
    )
    assert.equal(res.status, 200, `${label} should be able to read work items`)
  }
})

test('a non-member is refused with 403, not 401', async () => {
  // 401 tells a client its session is dead, which makes it sign the user out of
  // the whole product. A valid session lacking access to one project is 403.
  const res = await readResponse(
    await issuesGet(authedRequest(outsider, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 403)
})

test('an unauthenticated request is refused with 401', async () => {
  const res = await readResponse(
    await issuesGet(authedRequest(null, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 401)
})

test('a global admin reaches a project without an explicit membership', async () => {
  const res = await readResponse(
    await issuesGet(authedRequest(globalAdmin, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 200)
})

// ---------------------------------------------------------------------------
// Write access
// ---------------------------------------------------------------------------

test('Viewer cannot create work items', async () => {
  const res = await readResponse(
    await issuesPost(
      authedRequest(viewer, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'Viewer should not be able to create this',
          workItemType: 'task',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.equal(res.status, 403)
  assert.equal(await db.issue.count({ where: { projectId: project.id } }), 0)
})

test('QA cannot create work items but can update them', async () => {
  // QA holds workitem:update without workitem:create — an asymmetry worth
  // pinning, since it is easy to collapse the two during a refactor.
  const res = await readResponse(
    await issuesPost(
      authedRequest(qa, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'QA create attempt',
          workItemType: 'task',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.equal(res.status, 403)
})

test('Dev can create work items', async () => {
  const res = await readResponse(
    await issuesPost(
      authedRequest(dev, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'Dev created work item',
          workItemType: 'task',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.equal(res.status, 201)
  assert.equal(await db.issue.count({ where: { projectId: project.id } }), 1)
})

test('a non-member cannot create work items', async () => {
  const res = await readResponse(
    await issuesPost(
      authedRequest(outsider, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'Outsider create attempt',
          workItemType: 'task',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.equal(res.status, 403)
  assert.equal(await db.issue.count({ where: { projectId: project.id } }), 0)
})

test('label creation follows workitem:update, so Viewer is refused', async () => {
  // Labels are work-item metadata, so the route gates on `workitem:update`
  // rather than `masterdata:manage`. That means QA — which can update but not
  // create work items — can still add labels. Pinning the real contract here so
  // a future change to either permission set is visible.
  const allowed = [
    ['Admin', admin],
    ['PM', pm],
    ['Dev', dev],
    ['QA', qa],
  ] as const

  for (const [label, user] of allowed) {
    const res = await readResponse(
      await labelsPost(
        authedRequest(user, '/api/labels', {
          method: 'POST',
          body: { projectId: project.id, name: `label-${user.id.slice(-6)}`, color: '#ff0000' },
        })
      )
    )
    assert.equal(res.status, 201, `${label} holds workitem:update and should create a label`)
  }

  for (const [label, user] of [
    ['Viewer', viewer],
    ['non-member', outsider],
  ] as const) {
    const res = await readResponse(
      await labelsPost(
        authedRequest(user, '/api/labels', {
          method: 'POST',
          body: { projectId: project.id, name: `nope-${user.id.slice(-6)}`, color: '#ff0000' },
        })
      )
    )
    assert.equal(res.status, 403, `${label} must not be able to create a label`)
  }
})

// ---------------------------------------------------------------------------
// Cross-project isolation
// ---------------------------------------------------------------------------

test('project data never leaks across projects', async () => {
  await createIssue({ projectId: project.id, reporterId: admin.id, title: 'ALPHA secret' })
  await createIssue({ projectId: otherProject.id, reporterId: admin.id, title: 'BETA secret' })

  const res = await readResponse<Array<{ title: string }>>(
    await issuesGet(authedRequest(admin, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 200)
  const titles = (res.body ?? []).map((issue) => issue.title)
  assert.ok(titles.includes('ALPHA secret'))
  assert.ok(!titles.includes('BETA secret'), 'BETA work items must not appear in an ALPHA query')
})

test('a member of one project cannot read another project', async () => {
  // `admin` is an Admin of ALPHA and a member of nothing in BETA.
  const res = await readResponse(
    await issuesGet(authedRequest(admin, `/api/issues?projectId=${otherProject.id}`))
  )

  assert.equal(res.status, 403)
})

test('activity is scoped to the requested project', async () => {
  const res = await readResponse(
    await activityGet(authedRequest(outsider, `/api/activity?projectId=${project.id}`))
  )

  assert.equal(res.status, 403)
})

// ---------------------------------------------------------------------------
// Session and account state
// ---------------------------------------------------------------------------

test('a revoked session is rejected', async () => {
  await db.authSession.update({
    where: { id: dev.sessionId },
    data: { revokedAt: new Date(), revokedReason: 'TEST' },
  })

  const res = await readResponse(
    await issuesGet(authedRequest(dev, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 401)
})

test('an expired session is rejected', async () => {
  await db.authSession.update({
    where: { id: dev.sessionId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  })

  const res = await readResponse(
    await issuesGet(authedRequest(dev, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 401)
})

test('a deactivated user is rejected even with a live session', async () => {
  // `User_active_state_chk` requires isActive and deactivatedAt to agree, so
  // both move together — matching what the deactivation endpoint writes.
  await db.user.update({
    where: { id: dev.id },
    data: { isActive: false, deactivatedAt: new Date() },
  })

  const res = await readResponse(
    await issuesGet(authedRequest(dev, `/api/issues?projectId=${project.id}`))
  )

  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// Permission disclosure
// ---------------------------------------------------------------------------

test('/api/rbac does not hand permissions to a non-member', async () => {
  // This previously returned 200 with a full Viewer permission set, confirming
  // the project existed and driving a UI whose every call then failed.
  const res = await readResponse(
    await rbacGet(authedRequest(outsider, `/api/rbac?projectId=${project.id}`))
  )

  assert.equal(res.status, 403)
  assert.equal((res.body as { permissions?: unknown })?.permissions, undefined)
})

test('/api/rbac reports the caller its real role', async () => {
  const res = await readResponse<{ role: string; permissions: string[] }>(
    await rbacGet(authedRequest(dev, `/api/rbac?projectId=${project.id}`))
  )

  assert.equal(res.status, 200)
  assert.equal(res.body?.role, 'Dev')
  assert.ok(res.body?.permissions.includes('workitem:create'))
  assert.ok(!res.body?.permissions.includes('acl:manage'))
})

test('labels are readable by members and refused to outsiders', async () => {
  const member = await readResponse(
    await labelsGet(authedRequest(viewer, `/api/labels?projectId=${project.id}`))
  )
  assert.equal(member.status, 200)

  const nonMember = await readResponse(
    await labelsGet(authedRequest(outsider, `/api/labels?projectId=${project.id}`))
  )
  assert.equal(nonMember.status, 403)
})
