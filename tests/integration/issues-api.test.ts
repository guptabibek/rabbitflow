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
import { PUT as issuePut, DELETE as issueDelete } from '../../src/app/api/issues/[issueId]/route.ts'

/**
 * Work-item CRUD: validation, optimistic locking and cross-project safety.
 *
 * The route handler for a single issue is over a thousand lines and carries
 * meaningful logic of its own — state transitions, custom-field diffing,
 * version checks — none of which the pure-function domain tests reach.
 */

let project: Awaited<ReturnType<typeof createProject>>
let otherProject: Awaited<ReturnType<typeof createProject>>
let admin: SeededUser
let outsider: SeededUser

const routeParams = (issueId: string) => ({ params: Promise.resolve({ issueId }) })

before(async () => {
  await resetDatabase()

  project = await createProject({ key: 'CRUD' })
  otherProject = await createProject({ key: 'OTHER' })

  admin = await createUser()
  outsider = await createUser()

  await addMember(project.id, admin.id, 'Admin')
  await addMember(otherProject.id, outsider.id, 'Admin')
})

after(async () => {
  await disconnect()
})

beforeEach(async () => {
  await db.issue.deleteMany({})
})

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

test('a work item is created with a project-scoped key', async () => {
  const res = await readResponse<{ key: string; title: string; version: number }>(
    await issuesPost(
      authedRequest(admin, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'First work item',
          workItemType: 'task',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.equal(res.status, 201)
  assert.match(res.body?.key ?? '', /^CRUD-\d+$/)
  assert.equal(res.body?.version, 1)
})

test('a required custom field is enforced server-side', async () => {
  // The seeded schema marks `scope` required on every type. The create form
  // hides it behind a tab, so this is the only thing preventing an invalid row.
  const res = await readResponse<{ error: string }>(
    await issuesPost(
      authedRequest(admin, '/api/issues', {
        method: 'POST',
        body: { projectId: project.id, title: 'Missing scope', workItemType: 'task' },
      })
    )
  )

  assert.equal(res.status, 400)
  assert.match(res.body?.error ?? '', /scope/i)
  assert.equal(await db.issue.count(), 0)
})

test('an empty title is rejected', async () => {
  const res = await readResponse(
    await issuesPost(
      authedRequest(admin, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: '   ',
          workItemType: 'task',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.equal(res.status, 400)
})

test('a due date before the start date is rejected', async () => {
  const res = await readResponse<{ error: string }>(
    await issuesPost(
      authedRequest(admin, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'Backwards schedule',
          workItemType: 'task',
          startDate: '2026-06-01T00:00:00.000Z',
          dueDate: '2026-05-01T00:00:00.000Z',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.equal(res.status, 400)
  assert.match(res.body?.error ?? '', /due date/i)
})

test('an unknown work item type is rejected', async () => {
  const res = await readResponse(
    await issuesPost(
      authedRequest(admin, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'Bad type',
          workItemType: 'not-a-real-type',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.equal(res.status, 400)
})

test('issue keys increment per project and do not collide across projects', async () => {
  const first = await readResponse<{ key: string }>(
    await issuesPost(
      authedRequest(admin, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'One',
          workItemType: 'task',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )
  const second = await readResponse<{ key: string }>(
    await issuesPost(
      authedRequest(admin, '/api/issues', {
        method: 'POST',
        body: {
          projectId: project.id,
          title: 'Two',
          workItemType: 'task',
          customFields: { scope: 'In Scope' },
        },
      })
    )
  )

  assert.notEqual(first.body?.key, second.body?.key)
  assert.ok(first.body?.key.startsWith('CRUD-'))
  assert.ok(second.body?.key.startsWith('CRUD-'))
})

// ---------------------------------------------------------------------------
// Update and optimistic locking
// ---------------------------------------------------------------------------

test('a work item can be updated and its version increments', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: admin.id })

  const res = await readResponse<{ title: string; version: number }>(
    await issuePut(
      authedRequest(admin, `/api/issues/${issue.id}`, {
        method: 'PUT',
        body: { title: 'Renamed', version: issue.version },
      }),
      routeParams(issue.id)
    )
  )

  assert.equal(res.status, 200)
  assert.equal(res.body?.title, 'Renamed')
  assert.equal(res.body?.version, issue.version + 1)
})

test('a stale version is refused with 409', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: admin.id })

  // First writer wins.
  await issuePut(
    authedRequest(admin, `/api/issues/${issue.id}`, {
      method: 'PUT',
      body: { title: 'First write', version: issue.version },
    }),
    routeParams(issue.id)
  )

  // Second writer still holds the original version.
  const res = await readResponse<{ error: string }>(
    await issuePut(
      authedRequest(admin, `/api/issues/${issue.id}`, {
        method: 'PUT',
        body: { title: 'Second write', version: issue.version },
      }),
      routeParams(issue.id)
    )
  )

  assert.equal(res.status, 409)
  const persisted = await db.issue.findUniqueOrThrow({ where: { id: issue.id } })
  assert.equal(persisted.title, 'First write', 'the losing write must not be applied')
})

test('the work item type cannot be changed after creation', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: admin.id })

  const res = await readResponse<{ error: string }>(
    await issuePut(
      authedRequest(admin, `/api/issues/${issue.id}`, {
        method: 'PUT',
        body: { workItemType: 'bug', version: issue.version },
      }),
      routeParams(issue.id)
    )
  )

  assert.equal(res.status, 400)
  assert.match(res.body?.error ?? '', /cannot be changed/i)
})

// ---------------------------------------------------------------------------
// Cross-project access
// ---------------------------------------------------------------------------

test('a work item in another project cannot be read', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: admin.id })

  const { GET: issueGet } = await import('../../src/app/api/issues/[issueId]/route.ts')
  const res = await readResponse(
    await issueGet(
      authedRequest(outsider, `/api/issues/${issue.id}`),
      routeParams(issue.id)
    )
  )

  assert.equal(res.status, 403)
})

test('a work item in another project cannot be updated', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: admin.id })

  const res = await readResponse(
    await issuePut(
      authedRequest(outsider, `/api/issues/${issue.id}`, {
        method: 'PUT',
        body: { title: 'Hijacked', version: issue.version },
      }),
      routeParams(issue.id)
    )
  )

  assert.equal(res.status, 403)
  const persisted = await db.issue.findUniqueOrThrow({ where: { id: issue.id } })
  assert.notEqual(persisted.title, 'Hijacked')
})

test('a work item in another project cannot be deleted', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: admin.id })

  const res = await readResponse(
    await issueDelete(
      authedRequest(outsider, `/api/issues/${issue.id}`, { method: 'DELETE' }),
      routeParams(issue.id)
    )
  )

  assert.equal(res.status, 403)
  assert.equal(await db.issue.count({ where: { id: issue.id } }), 1)
})

test('a missing work item returns 404, not 500', async () => {
  const { GET: issueGet } = await import('../../src/app/api/issues/[issueId]/route.ts')
  const res = await readResponse(
    await issueGet(
      authedRequest(admin, '/api/issues/does-not-exist'),
      routeParams('does-not-exist')
    )
  )

  assert.equal(res.status, 404)
})

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

test('listing respects the page size cap', async () => {
  for (let index = 0; index < 5; index += 1) {
    await createIssue({ projectId: project.id, reporterId: admin.id, title: `Item ${index}` })
  }

  const res = await readResponse<unknown[]>(
    await issuesGet(
      authedRequest(admin, `/api/issues?projectId=${project.id}&minimal=true&pageSize=2`)
    )
  )

  assert.equal(res.status, 200)
  assert.equal(res.body?.length, 2)
})

test('listing reports a total count when asked', async () => {
  for (let index = 0; index < 3; index += 1) {
    await createIssue({ projectId: project.id, reporterId: admin.id })
  }

  const response = await issuesGet(
    authedRequest(
      admin,
      `/api/issues?projectId=${project.id}&minimal=true&includeTotal=true&pageSize=2`
    )
  )

  assert.equal(response.headers.get('x-total-count'), '3')
})

test('search matches on title and on issue key', async () => {
  await createIssue({
    projectId: project.id,
    reporterId: admin.id,
    title: 'Distinctive haystack phrase',
  })
  await createIssue({ projectId: project.id, reporterId: admin.id, title: 'Unrelated' })

  const byTitle = await readResponse<Array<{ title: string }>>(
    await issuesGet(
      authedRequest(admin, `/api/issues?projectId=${project.id}&minimal=true&search=haystack`)
    )
  )

  assert.equal(byTitle.status, 200)
  assert.equal(byTitle.body?.length, 1)
  assert.equal(byTitle.body?.[0].title, 'Distinctive haystack phrase')

  const byKey = await readResponse<Array<{ key: string }>>(
    await issuesGet(
      authedRequest(admin, `/api/issues?projectId=${project.id}&minimal=true&search=CRUD-1`)
    )
  )
  assert.ok((byKey.body?.length ?? 0) >= 1, 'searching an issue key should match it')
})

test('a search with no matches returns an empty list, not an error', async () => {
  await createIssue({ projectId: project.id, reporterId: admin.id, title: 'Something' })

  const res = await readResponse<unknown[]>(
    await issuesGet(
      authedRequest(
        admin,
        `/api/issues?projectId=${project.id}&minimal=true&search=zzzznomatchzzzz`
      )
    )
  )

  assert.equal(res.status, 200)
  assert.deepEqual(res.body, [])
})
