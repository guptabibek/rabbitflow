import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db, disconnect, resetDatabase } from './support/db.ts'
import {
  addMember,
  authedRequest,
  createIssue,
  createProject,
  createUser,
  readResponse,
} from './support/fixtures.ts'
import {
  attachSlaTimers,
  checkAndMarkBreachedTimers,
  handleSlaStatusChange,
} from '../../src/lib/domain/sla-engine.ts'
import { invalidateProjectPermissionRuleCache } from '../../src/lib/domain/access-control.ts'
import { GET as slaTimersGet } from '../../src/app/api/sla-timers/route.ts'

let project: Awaited<ReturnType<typeof createProject>>
let reporter: Awaited<ReturnType<typeof createUser>>
let issue: Awaited<ReturnType<typeof createIssue>>
let policyId: string

after(async () => {
  await disconnect()
})

beforeEach(async () => {
  await resetDatabase()
  project = await createProject({ key: 'SLALIFE' })
  reporter = await createUser()
  issue = await createIssue({
    projectId: project.id,
    reporterId: reporter.id,
    title: 'SLA lifecycle test issue',
  })
  policyId = (
    await db.slaPolicy.create({
      data: {
        projectId: project.id,
        name: 'Lifecycle policy',
        responseTimeMinutes: 30,
        resolutionTimeMinutes: 60,
        businessHoursOnly: false,
      },
      select: { id: true },
    })
  ).id
})

test('breach detection records the breach without replacing lifecycle state', async () => {
  const timer = await db.slaTimer.create({
    data: {
      issueId: issue.id,
      policyId,
      timerType: 'resolution',
      startedAt: new Date(Date.now() - 60 * 60_000),
      targetAt: new Date(Date.now() - 5 * 60_000),
      status: 'running',
    },
  })

  assert.equal(await checkAndMarkBreachedTimers(), 1)

  const breached = await db.slaTimer.findUniqueOrThrow({ where: { id: timer.id } })
  assert.equal(breached.status, 'running')
  assert.ok(breached.breachedAt)
  assert.equal(await checkAndMarkBreachedTimers(), 0)
})

test('SLA attachment is idempotent under queue redelivery', async () => {
  await attachSlaTimers(issue.id, project.id, issue.priority, issue.workItemType)
  await attachSlaTimers(issue.id, project.id, issue.priority, issue.workItemType)

  const timers = await db.slaTimer.findMany({
    where: { issueId: issue.id, policyId },
    orderBy: { timerType: 'asc' },
  })
  assert.equal(timers.length, 2)
  assert.deepEqual(timers.map((timer) => timer.timerType), ['resolution', 'response'])
})

test('attachment uses current issue attributes and completes response for an already-active issue', async () => {
  await db.issue.update({
    where: { id: issue.id },
    data: { status: 'in_progress', priority: 'high' },
  })
  await db.slaPolicy.update({
    where: { id: policyId },
    data: { priorityFilter: ['high'] },
  })

  // Deliberately stale payload values must not control policy matching.
  await attachSlaTimers(issue.id, project.id, 'low', 'bug')

  const timers = await db.slaTimer.findMany({
    where: { issueId: issue.id, policyId },
    orderBy: { timerType: 'asc' },
  })
  assert.equal(timers.length, 2)
  assert.equal(timers.find((timer) => timer.timerType === 'response')?.status, 'completed')
  assert.equal(timers.find((timer) => timer.timerType === 'resolution')?.status, 'running')
})

test('legacy breached timers still complete when their issue is resolved', async () => {
  const startedAt = new Date(Date.now() - 45 * 60_000)
  const timer = await db.slaTimer.create({
    data: {
      issueId: issue.id,
      policyId,
      timerType: 'resolution',
      startedAt,
      targetAt: new Date(Date.now() - 15 * 60_000),
      breachedAt: new Date(Date.now() - 15 * 60_000),
      status: 'breached',
    },
  })

  await handleSlaStatusChange(issue.id, 'in_progress', 'done')

  const completed = await db.slaTimer.findUniqueOrThrow({ where: { id: timer.id } })
  assert.equal(completed.status, 'completed')
  assert.ok(completed.completedAt)
  assert.ok(completed.breachedAt)
  assert.ok(completed.elapsedMinutes >= 44 && completed.elapsedMinutes <= 46)
})

test('pause and resume count each running interval once and extend the deadline by the pause', async () => {
  const startedAt = new Date(Date.now() - 20 * 60_000)
  const originalTarget = new Date(Date.now() + 40 * 60_000)
  const timer = await db.slaTimer.create({
    data: {
      issueId: issue.id,
      policyId,
      timerType: 'resolution',
      startedAt,
      targetAt: originalTarget,
      status: 'running',
    },
  })

  await handleSlaStatusChange(issue.id, 'in_progress', 'todo')
  const paused = await db.slaTimer.findUniqueOrThrow({ where: { id: timer.id } })
  assert.equal(paused.status, 'paused')
  assert.ok(paused.pausedAt)
  assert.ok(paused.elapsedMinutes >= 19 && paused.elapsedMinutes <= 21)

  const simulatedPausedAt = new Date(Date.now() - 10 * 60_000)
  await db.slaTimer.update({
    where: { id: timer.id },
    data: { pausedAt: simulatedPausedAt },
  })

  const resumedAtLowerBound = Date.now()
  await handleSlaStatusChange(issue.id, 'todo', 'in_progress')
  const resumedAtUpperBound = Date.now()
  const resumed = await db.slaTimer.findUniqueOrThrow({ where: { id: timer.id } })
  assert.equal(resumed.status, 'running')
  assert.equal(resumed.pausedAt, null)
  assert.ok(resumed.startedAt.getTime() >= resumedAtLowerBound - 60_000)
  assert.ok(resumed.startedAt.getTime() <= resumedAtUpperBound)
  assert.ok(resumed.startedAt.getTime() > startedAt.getTime())
  const targetExtension = resumed.targetAt.getTime() - originalTarget.getTime()
  assert.ok(targetExtension >= 9.9 * 60_000 && targetExtension <= 10.1 * 60_000)

  await handleSlaStatusChange(issue.id, 'in_progress', 'done')
  const completed = await db.slaTimer.findUniqueOrThrow({ where: { id: timer.id } })
  assert.equal(completed.status, 'completed')
  assert.ok(completed.elapsedMinutes >= 19 && completed.elapsedMinutes <= 21)
})

test('timer listing cannot escape the project used for authorization', async () => {
  const viewer = await createUser()
  await addMember(project.id, viewer.id, 'Viewer')
  const otherProject = await createProject({ key: 'SLAOTHER' })
  const otherIssue = await createIssue({
    projectId: otherProject.id,
    reporterId: reporter.id,
    title: 'Other project SLA secret',
  })
  const otherPolicy = await db.slaPolicy.create({
    data: {
      projectId: otherProject.id,
      name: 'Other project policy',
      responseTimeMinutes: 30,
      resolutionTimeMinutes: 60,
      businessHoursOnly: false,
    },
  })
  await db.slaTimer.create({
    data: {
      issueId: otherIssue.id,
      policyId: otherPolicy.id,
      timerType: 'resolution',
      targetAt: new Date(Date.now() + 60 * 60_000),
    },
  })

  const response = await readResponse<unknown[]>(
    await slaTimersGet(
      authedRequest(
        viewer,
        `/api/sla-timers?projectId=${project.id}&issueId=${otherIssue.id}`
      )
    )
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, [])
})

test('timer listing excludes issues denied by area read ACLs', async () => {
  const viewer = await createUser()
  await addMember(project.id, viewer.id, 'Viewer')
  const allowedArea = await db.area.findFirstOrThrow({
    where: { projectId: project.id },
  })
  const deniedArea = await db.area.create({
    data: {
      projectId: project.id,
      name: 'Restricted SLA area',
      path: 'Restricted SLA area',
      pathSegments: ['Restricted SLA area'],
    },
  })
  const allowedIssue = await db.issue.update({
    where: { id: issue.id },
    data: { areaId: allowedArea.id },
  })
  const deniedIssue = await createIssue({
    projectId: project.id,
    reporterId: reporter.id,
    title: 'Restricted SLA issue',
    areaId: deniedArea.id,
  })
  await db.slaTimer.createMany({
    data: [allowedIssue, deniedIssue].map((record) => ({
      issueId: record.id,
      policyId,
      timerType: 'resolution',
      targetAt: new Date(Date.now() + 60 * 60_000),
    })),
  })
  await db.projectPermissionRule.create({
    data: {
      projectId: project.id,
      areaId: deniedArea.id,
      role: 'Viewer',
      permission: 'workitem:read',
      effect: 'deny',
    },
  })
  await invalidateProjectPermissionRuleCache(project.id)

  const response = await readResponse<Array<{ issueId: string }>>(
    await slaTimersGet(
      authedRequest(viewer, `/api/sla-timers?projectId=${project.id}`)
    )
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.body?.map((timer) => timer.issueId), [allowedIssue.id])
})
