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
import { statusFromStateCategory } from '../../src/lib/domain/state-machine.ts'
import { POST as bulkPost } from '../../src/app/api/issues/bulk/route.ts'

let project: Awaited<ReturnType<typeof createProject>>
let otherProject: Awaited<ReturnType<typeof createProject>>
let admin: SeededUser
let dev: SeededUser
let qa: SeededUser
let outsider: SeededUser
let areaId: string
let restrictedAreaId: string
let foreignAreaId: string
let foreignIterationId: string
let localLabelId: string
let foreignLabelId: string
let taskTypeId: string

before(async () => {
  await resetDatabase()

  project = await createProject({ key: 'BULKA' })
  otherProject = await createProject({ key: 'BULKB' })
  admin = await createUser()
  dev = await createUser()
  qa = await createUser()
  outsider = await createUser()

  await addMember(project.id, admin.id, 'Admin')
  await addMember(project.id, dev.id, 'Dev')
  await addMember(project.id, qa.id, 'QA')

  areaId = (
    await db.area.findFirstOrThrow({ where: { projectId: project.id }, select: { id: true } })
  ).id
  foreignAreaId = (
    await db.area.findFirstOrThrow({
      where: { projectId: otherProject.id },
      select: { id: true },
    })
  ).id
  restrictedAreaId = (
    await db.area.create({
      data: {
        projectId: project.id,
        name: 'Restricted bulk area',
        path: 'Restricted bulk area',
        pathSegments: ['Restricted bulk area'],
      },
      select: { id: true },
    })
  ).id

  foreignIterationId = (
    await db.iteration.create({
      data: {
        projectId: otherProject.id,
        name: 'Foreign bulk iteration',
        path: 'Foreign bulk iteration',
        pathSegments: ['Foreign bulk iteration'],
      },
      select: { id: true },
    })
  ).id
  localLabelId = (
    await db.label.create({
      data: { projectId: project.id, name: 'Local bulk label' },
      select: { id: true },
    })
  ).id
  foreignLabelId = (
    await db.label.create({
      data: { projectId: otherProject.id, name: 'Foreign bulk label' },
      select: { id: true },
    })
  ).id
  taskTypeId = (
    await db.workItemTypeDefinition.findUniqueOrThrow({
      where: { projectId_key: { projectId: project.id, key: 'task' } },
      select: { id: true },
    })
  ).id
})

after(async () => {
  await disconnect()
})

beforeEach(async () => {
  await db.issue.deleteMany({})
  await db.projectPermissionRule.deleteMany({ where: { projectId: project.id } })
  await invalidateProjectPermissionRuleCache(project.id)
})

async function createStatefulIssue(options?: { areaId?: string; title?: string }) {
  const initialMapping = await db.workItemTypeStateMapping.findFirstOrThrow({
    where: { projectId: project.id, workItemTypeId: taskTypeId },
    orderBy: [{ isInitial: 'desc' }, { order: 'asc' }],
    include: { state: { select: { id: true, category: true } } },
  })
  const issue = await createIssue({
    projectId: project.id,
    reporterId: admin.id,
    title: options?.title,
    areaId: options?.areaId ?? areaId,
    status: statusFromStateCategory(initialMapping.state.category),
  })
  return db.issue.update({
    where: { id: issue.id },
    data: { stateId: initialMapping.state.id },
  })
}

async function bulk(user: SeededUser, body: Record<string, unknown>) {
  return readResponse<{ error?: string; action?: string }>(
    await bulkPost(
      authedRequest(user, '/api/issues/bulk', {
        method: 'POST',
        body: { projectId: project.id, ...body },
      })
    )
  )
}

test('bulk assignment requires workitem:assign', async () => {
  const issue = await createStatefulIssue()

  const response = await bulk(qa, {
    action: 'update',
    issueIds: [issue.id],
    updates: { assigneeId: dev.id },
  })

  assert.equal(response.status, 403)
  assert.equal((await db.issue.findUniqueOrThrow({ where: { id: issue.id } })).assigneeId, null)
})

test('bulk status changes honor area-scoped transition denial', async () => {
  const issue = await createStatefulIssue()
  await db.projectPermissionRule.create({
    data: {
      projectId: project.id,
      areaId,
      role: 'QA',
      permission: 'workitem:transition',
      effect: 'deny',
    },
  })
  await invalidateProjectPermissionRuleCache(project.id)

  const response = await bulk(qa, {
    action: 'update',
    issueIds: [issue.id],
    updates: { status: 'done' },
  })

  assert.equal(response.status, 403)
  const persisted = await db.issue.findUniqueOrThrow({ where: { id: issue.id } })
  assert.equal(persisted.status, issue.status)
  assert.equal(persisted.stateId, issue.stateId)
})

test('bulk area changes require update permission in both source and target areas', async () => {
  const issue = await createStatefulIssue()
  await db.projectPermissionRule.create({
    data: {
      projectId: project.id,
      areaId: restrictedAreaId,
      role: 'QA',
      permission: 'workitem:update',
      effect: 'deny',
    },
  })
  await invalidateProjectPermissionRuleCache(project.id)

  const targetDenied = await bulk(qa, {
    action: 'update',
    issueIds: [issue.id],
    updates: { areaId: restrictedAreaId },
  })
  assert.equal(targetDenied.status, 403)

  const restrictedIssue = await createStatefulIssue({ areaId: restrictedAreaId })
  const sourceDenied = await bulk(qa, {
    action: 'update',
    issueIds: [restrictedIssue.id],
    updates: { areaId },
  })
  assert.equal(sourceDenied.status, 403)
})

test('bulk updates reject references owned by another project', async () => {
  const cases = [
    { name: 'assignee', updates: { assigneeId: outsider.id } },
    { name: 'area', updates: { areaId: foreignAreaId } },
    { name: 'iteration', updates: { iterationId: foreignIterationId } },
    { name: 'label', updates: { addLabelIds: [foreignLabelId] } },
  ]

  for (const entry of cases) {
    const issue = await createStatefulIssue({ title: `Foreign ${entry.name}` })
    const response = await bulk(admin, {
      action: 'update',
      issueIds: [issue.id],
      updates: entry.updates,
    })
    assert.equal(response.status, 400, `${entry.name} should be rejected`)
  }
})

test('valid bulk field and assignment updates increment each issue version', async () => {
  const first = await createStatefulIssue({ title: 'Bulk valid one' })
  const second = await createStatefulIssue({ title: 'Bulk valid two' })
  const dueDate = new Date(Date.now() + 86_400_000).toISOString()

  const response = await bulk(admin, {
    action: 'update',
    issueIds: [first.id, second.id],
    updates: {
      priority: 'highest',
      storyPoints: 8,
      dueDate,
      assigneeId: dev.id,
      addLabelIds: [localLabelId],
    },
  })

  assert.equal(response.status, 200)
  assert.equal(response.body?.action, 'updated')
  const persisted = await db.issue.findMany({
    where: { id: { in: [first.id, second.id] } },
    include: { labels: true },
  })
  assert.equal(persisted.length, 2)
  for (const issue of persisted) {
    assert.equal(issue.priority, 'highest')
    assert.equal(issue.storyPoints, 8)
    assert.equal(issue.assigneeId, dev.id)
    assert.equal(issue.version, 2)
    assert.deepEqual(issue.labels.map((label) => label.labelId), [localLabelId])
  }
})

test('valid bulk status changes keep status, state, completion, and version in sync', async () => {
  const transitions = await db.stateTransition.findMany({
    where: {
      projectId: project.id,
      workItemTypeId: taskTypeId,
      isEnabled: true,
      requiresApproval: false,
    },
    include: {
      fromState: { select: { id: true, category: true } },
      toState: { select: { id: true, category: true, isFinal: true } },
    },
  })
  const transition = transitions.find(
    (candidate) =>
      statusFromStateCategory(candidate.fromState.category) !==
      statusFromStateCategory(candidate.toState.category)
  )
  assert.ok(transition, 'default task workflow should include a cross-category transition')
  const fromStatus = statusFromStateCategory(transition.fromState.category)
  const toStatus = statusFromStateCategory(transition.toState.category)
  const issue = await createStatefulIssue()
  await db.issue.update({
    where: { id: issue.id },
    data: { stateId: transition.fromState.id, status: fromStatus },
  })

  const response = await bulk(admin, {
    action: 'update',
    issueIds: [issue.id],
    updates: { status: toStatus },
  })

  assert.equal(response.status, 200)
  const persisted = await db.issue.findUniqueOrThrow({ where: { id: issue.id } })
  assert.equal(persisted.status, toStatus)
  assert.equal(persisted.stateId, transition.toState.id)
  assert.equal(persisted.version, 2)
  assert.equal(Boolean(persisted.completedDate), transition.toState.isFinal)
})

test('bulk payload rejects invalid dates and duplicate issue IDs', async () => {
  const issue = await createStatefulIssue()

  const invalidDate = await bulk(admin, {
    action: 'update',
    issueIds: [issue.id],
    updates: { dueDate: 'not-a-date' },
  })
  assert.equal(invalidDate.status, 400)

  const duplicateIds = await bulk(admin, {
    action: 'update',
    issueIds: [issue.id, issue.id],
    updates: { priority: 'high' },
  })
  assert.equal(duplicateIds.status, 400)

  const emptyUpdate = await bulk(admin, {
    action: 'update',
    issueIds: [issue.id],
    updates: {},
  })
  assert.equal(emptyUpdate.status, 400)

  const unknownUpdate = await bulk(admin, {
    action: 'update',
    issueIds: [issue.id],
    updates: { unsupportedField: true },
  })
  assert.equal(unknownUpdate.status, 400)

  const conflictingLabels = await bulk(admin, {
    action: 'update',
    issueIds: [issue.id],
    updates: { addLabelIds: [localLabelId], removeLabelIds: [localLabelId] },
  })
  assert.equal(conflictingLabels.status, 400)

  assert.equal((await db.issue.findUniqueOrThrow({ where: { id: issue.id } })).version, 1)
})

test('bulk transitions enforce approvals for every issue before writing any issue', async () => {
  const transitions = await db.stateTransition.findMany({
    where: { projectId: project.id, workItemTypeId: taskTypeId, isEnabled: true },
    include: {
      fromState: { select: { id: true, category: true } },
      toState: { select: { id: true, category: true } },
    },
  })
  const transition = transitions.find(
    (candidate) =>
      statusFromStateCategory(candidate.fromState.category) !==
      statusFromStateCategory(candidate.toState.category)
  )
  assert.ok(transition, 'default task workflow should include a cross-category transition')

  const fromStatus = statusFromStateCategory(transition.fromState.category)
  const toStatus = statusFromStateCategory(transition.toState.category)
  const approvedIssue = await createStatefulIssue({ title: 'Approved bulk transition' })
  const unapprovedIssue = await createStatefulIssue({ title: 'Unapproved bulk transition' })
  await db.issue.updateMany({
    where: { id: { in: [approvedIssue.id, unapprovedIssue.id] } },
    data: { stateId: transition.fromState.id, status: fromStatus },
  })

  await db.stateTransition.update({
    where: { id: transition.id },
    data: { requiresApproval: true, minApprovals: 1 },
  })

  try {
    await db.approvalRequest.create({
      data: {
        issueId: approvedIssue.id,
        transitionId: transition.id,
        requestedById: admin.id,
        status: 'approved',
        fromStateId: transition.fromState.id,
        toStateId: transition.toState.id,
        requiredApprovals: 1,
        approverUserIds: [admin.id],
        resolvedAt: new Date(),
      },
    })

    const response = await bulk(admin, {
      action: 'update',
      issueIds: [approvedIssue.id, unapprovedIssue.id],
      updates: { status: toStatus },
    })

    assert.equal(response.status, 409)
    const persisted = await db.issue.findMany({
      where: { id: { in: [approvedIssue.id, unapprovedIssue.id] } },
      orderBy: { title: 'asc' },
    })
    assert.equal(persisted.length, 2)
    for (const issue of persisted) {
      assert.equal(issue.status, fromStatus)
      assert.equal(issue.stateId, transition.fromState.id)
      assert.equal(issue.version, 1)
    }
  } finally {
    await db.stateTransition.update({
      where: { id: transition.id },
      data: { requiresApproval: transition.requiresApproval, minApprovals: transition.minApprovals },
    })
  }
})

test('bulk update handles the 200-item boundary exactly once per issue', async () => {
  const initialMapping = await db.workItemTypeStateMapping.findFirstOrThrow({
    where: { projectId: project.id, workItemTypeId: taskTypeId },
    orderBy: [{ isInitial: 'desc' }, { order: 'asc' }],
    include: { state: { select: { id: true, category: true } } },
  })
  const titlePrefix = 'Bulk boundary item '
  await db.issue.createMany({
    data: Array.from({ length: 200 }, (_, index) => ({
      projectId: project.id,
      key: `${project.key}-${10_000 + index}`,
      title: `${titlePrefix}${index}`,
      reporterId: admin.id,
      areaId,
      stateId: initialMapping.state.id,
      status: statusFromStateCategory(initialMapping.state.category),
    })),
  })
  const issues = await db.issue.findMany({
    where: { projectId: project.id, title: { startsWith: titlePrefix } },
    select: { id: true },
  })
  assert.equal(issues.length, 200)

  const response = await bulk(admin, {
    action: 'update',
    issueIds: issues.map((issue) => issue.id),
    updates: { priority: 'low' },
  })

  assert.equal(response.status, 200)
  assert.equal(
    await db.issue.count({
      where: {
        id: { in: issues.map((issue) => issue.id) },
        priority: 'low',
        version: 2,
      },
    }),
    200
  )

  const overLimit = await bulk(admin, {
    action: 'update',
    issueIds: Array.from({ length: 201 }, (_, index) => `over-limit-${index}`),
    updates: { priority: 'high' },
  })
  assert.equal(overLimit.status, 400)
})
