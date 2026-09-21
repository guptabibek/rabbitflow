import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db, disconnect, resetDatabase } from './support/db.ts'
import {
  addMember,
  authedRequest,
  createIssue,
  createProject,
  createUser,
  readResponse,
  type SeededUser,
} from './support/fixtures.ts'
import { invalidateProjectPermissionRuleCache } from '../../src/lib/domain/access-control.ts'
import { GET as bootstrapGet } from '../../src/app/api/projects/bootstrap/route.ts'

type CountedRecord = { id: string; _count: { issues: number } }
type BootstrapBody = {
  issues: Array<{ id: string; title: string }>
  issueTotal: number
  labels: CountedRecord[]
  iterations: CountedRecord[]
  states: CountedRecord[]
  workItemTypes: CountedRecord[]
}

let project: Awaited<ReturnType<typeof createProject>>
let viewer: SeededUser
let allowedAreaId: string
let deniedAreaId: string
let allowedIssueId: string
let deniedIssueId: string
let labelId: string
let iterationId: string
let stateId: string
let workItemTypeId: string

before(async () => {
  await resetDatabase()

  project = await createProject({ key: 'BOOT' })
  const admin = await createUser()
  viewer = await createUser()
  await addMember(project.id, admin.id, 'Admin')
  await addMember(project.id, viewer.id, 'Viewer')

  const allowedArea = await db.area.findFirstOrThrow({
    where: { projectId: project.id },
    select: { id: true },
  })
  const deniedArea = await db.area.create({
    data: {
      projectId: project.id,
      name: 'Restricted bootstrap area',
      path: 'Restricted bootstrap area',
      pathSegments: ['Restricted bootstrap area'],
    },
    select: { id: true },
  })
  allowedAreaId = allowedArea.id
  deniedAreaId = deniedArea.id

  const state = await db.state.findFirstOrThrow({
    where: { projectId: project.id },
    orderBy: { order: 'asc' },
    select: { id: true },
  })
  stateId = state.id

  const workItemType = await db.workItemTypeDefinition.findFirstOrThrow({
    where: { projectId: project.id, key: 'task' },
    select: { id: true },
  })
  workItemTypeId = workItemType.id

  const iteration = await db.iteration.create({
    data: {
      projectId: project.id,
      name: 'Bootstrap sprint',
      path: 'Bootstrap sprint',
      pathSegments: ['Bootstrap sprint'],
      status: 'Active',
    },
    select: { id: true },
  })
  iterationId = iteration.id

  const label = await db.label.create({
    data: { projectId: project.id, name: 'Bootstrap label' },
    select: { id: true },
  })
  labelId = label.id

  const allowedIssue = await createIssue({
    projectId: project.id,
    reporterId: admin.id,
    title: 'Allowed bootstrap issue',
    areaId: allowedAreaId,
  })
  const deniedIssue = await createIssue({
    projectId: project.id,
    reporterId: admin.id,
    title: 'Denied bootstrap issue',
    areaId: deniedAreaId,
  })
  allowedIssueId = allowedIssue.id
  deniedIssueId = deniedIssue.id

  await db.issue.updateMany({
    where: { id: { in: [allowedIssueId, deniedIssueId] } },
    data: { iterationId, stateId },
  })
  await db.issueLabel.createMany({
    data: [
      { issueId: allowedIssueId, labelId },
      { issueId: deniedIssueId, labelId },
    ],
  })
})

after(async () => {
  await disconnect()
})

beforeEach(async () => {
  await db.projectPermissionRule.deleteMany({ where: { projectId: project.id } })
  await invalidateProjectPermissionRuleCache(project.id)
})

async function getBootstrap() {
  return readResponse<BootstrapBody>(
    await bootstrapGet(
      authedRequest(viewer, `/api/projects/bootstrap?projectId=${project.id}&pageSize=200`)
    )
  )
}

function issueCount(records: CountedRecord[], id: string) {
  return records.find((record) => record.id === id)?._count.issues
}

function assertOnlyAllowedIssueIsCounted(body: BootstrapBody | null) {
  assert.deepEqual(body?.issues.map((issue) => issue.id), [allowedIssueId])
  assert.ok(!body?.issues.some((issue) => issue.id === deniedIssueId))
  assert.equal(body?.issueTotal, 1)
  assert.equal(issueCount(body?.labels ?? [], labelId), 1)
  assert.equal(issueCount(body?.iterations ?? [], iterationId), 1)
  assert.equal(issueCount(body?.states ?? [], stateId), 1)
  assert.equal(issueCount(body?.workItemTypes ?? [], workItemTypeId), 1)
}

test('bootstrap excludes denied-area issues from rows, totals, and grouped counts', async () => {
  await db.projectPermissionRule.create({
    data: {
      projectId: project.id,
      areaId: deniedAreaId,
      role: 'Viewer',
      permission: 'workitem:read',
      effect: 'deny',
    },
  })
  await invalidateProjectPermissionRuleCache(project.id)

  const response = await getBootstrap()

  assert.equal(response.status, 200)
  assertOnlyAllowedIssueIsCounted(response.body)
})

test('bootstrap returns no issue data when project-level work-item read is denied', async () => {
  await db.projectPermissionRule.create({
    data: {
      projectId: project.id,
      role: 'Viewer',
      permission: 'workitem:read',
      effect: 'deny',
    },
  })
  await invalidateProjectPermissionRuleCache(project.id)

  const response = await getBootstrap()

  assert.equal(response.status, 200)
  assert.deepEqual(response.body?.issues, [])
  assert.equal(response.body?.issueTotal, 0)
  assert.equal(issueCount(response.body?.labels ?? [], labelId), 0)
  assert.equal(issueCount(response.body?.iterations ?? [], iterationId), 0)
  assert.equal(issueCount(response.body?.states ?? [], stateId), 0)
  assert.equal(issueCount(response.body?.workItemTypes ?? [], workItemTypeId), 0)
})

test('bootstrap honors a work-item read grant limited to one area', async () => {
  await db.projectPermissionRule.createMany({
    data: [
      {
        projectId: project.id,
        role: 'Viewer',
        permission: 'workitem:read',
        effect: 'deny',
      },
      {
        projectId: project.id,
        areaId: allowedAreaId,
        role: 'Viewer',
        permission: 'workitem:read',
        effect: 'allow',
      },
    ],
  })
  await invalidateProjectPermissionRuleCache(project.id)

  const response = await getBootstrap()

  assert.equal(response.status, 200)
  assertOnlyAllowedIssueIsCounted(response.body)
})
