import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db, disconnect, resetDatabase } from './support/db.ts'
import { addMember, authedRequest, createIssue, createProject, createUser, readResponse, type SeededUser } from './support/fixtures.ts'
import { POST as relationPost } from '../../src/app/api/relations/route.ts'

let project: Awaited<ReturnType<typeof createProject>>
let admin: SeededUser

before(async () => {
  await resetDatabase()
  project = await createProject({ key: 'DEPS' })
  admin = await createUser()
  await addMember(project.id, admin.id, 'Admin')
})

after(async () => disconnect())
beforeEach(async () => {
  await db.issueRelation.deleteMany({})
  await db.issue.deleteMany({})
})

async function createDependency(sourceIssueId: string, targetIssueId: string, relationType = 'blocks') {
  return readResponse<{ error?: string; details?: { code?: string; issueIds?: string[] } }>(
    await relationPost(authedRequest(admin, '/api/relations', {
      method: 'POST',
      body: { sourceIssueId, targetIssueId, relationType },
    }))
  )
}

test('a blocking link that closes a dependency cycle is rejected before persistence', async () => {
  const first = await createIssue({ projectId: project.id, reporterId: admin.id, title: 'First' })
  const second = await createIssue({ projectId: project.id, reporterId: admin.id, title: 'Second' })
  const third = await createIssue({ projectId: project.id, reporterId: admin.id, title: 'Third' })

  assert.equal((await createDependency(first.id, second.id)).status, 201)
  assert.equal((await createDependency(second.id, third.id)).status, 201)
  const cycle = await createDependency(third.id, first.id)

  assert.equal(cycle.status, 409)
  assert.equal(cycle.body?.details?.code, 'dependency_cycle')
  assert.deepEqual(new Set(cycle.body?.details?.issueIds), new Set([first.id, second.id, third.id, first.id]))
  assert.equal(await db.issueRelation.count(), 2)
})

test('blocked_by orientation is normalized when detecting a cycle', async () => {
  const first = await createIssue({ projectId: project.id, reporterId: admin.id })
  const second = await createIssue({ projectId: project.id, reporterId: admin.id })
  assert.equal((await createDependency(first.id, second.id, 'blocks')).status, 201)

  const inverseCycle = await createDependency(first.id, second.id, 'blocked_by')
  assert.equal(inverseCycle.status, 409)
  assert.equal(inverseCycle.body?.details?.code, 'dependency_cycle')
  assert.equal(await db.issueRelation.count(), 1)
})
