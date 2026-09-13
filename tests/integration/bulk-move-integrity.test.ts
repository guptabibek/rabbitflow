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
  type SeededUser,
} from './support/fixtures.ts'
import { statusFromStateCategory } from '../../src/lib/domain/state-machine.ts'
import { invalidateProjectPermissionRuleCache } from '../../src/lib/domain/access-control.ts'
import { POST as bulkPost } from '../../src/app/api/issues/bulk/route.ts'

let sourceProject: Awaited<ReturnType<typeof createProject>>
let targetProject: Awaited<ReturnType<typeof createProject>>
let admin: SeededUser
let sourceOnlyAssignee: SeededUser
let sourceIterationId: string

after(async () => {
  await disconnect()
})

beforeEach(async () => {
  await resetDatabase()
  sourceProject = await createProject({ key: 'MOVESRC' })
  targetProject = await createProject({ key: 'MOVEDST' })
  admin = await createUser()
  sourceOnlyAssignee = await createUser()
  await addMember(sourceProject.id, admin.id, 'Admin')
  await addMember(targetProject.id, admin.id, 'Admin')
  await addMember(sourceProject.id, sourceOnlyAssignee.id, 'Dev')
  sourceIterationId = (
    await db.iteration.create({
      data: {
        projectId: sourceProject.id,
        name: 'Source move iteration',
        path: 'Source move iteration',
        pathSegments: ['Source move iteration'],
      },
      select: { id: true },
    })
  ).id
})

async function bulkMove(issueIds: string[], targetProjectId = targetProject.id) {
  return readResponse<{ error?: string; action?: string }>(
    await bulkPost(
      authedRequest(admin, '/api/issues/bulk', {
        method: 'POST',
        body: {
          projectId: sourceProject.id,
          issueIds,
          action: 'move',
          targetProjectId,
        },
      })
    )
  )
}

async function createMovableIssue(title: string) {
  const sourceType = await db.workItemTypeDefinition.findUniqueOrThrow({
    where: { projectId_key: { projectId: sourceProject.id, key: 'task' } },
    select: { id: true },
  })
  const initialMapping = await db.workItemTypeStateMapping.findFirstOrThrow({
    where: { projectId: sourceProject.id, workItemTypeId: sourceType.id },
    orderBy: [{ isInitial: 'desc' }, { order: 'asc' }],
    include: { state: { select: { id: true, category: true } } },
  })
  const area = await db.area.findFirstOrThrow({ where: { projectId: sourceProject.id } })
  const issue = await createIssue({
    projectId: sourceProject.id,
    reporterId: admin.id,
    title,
    areaId: area.id,
    status: statusFromStateCategory(initialMapping.state.category),
  })
  const updated = await db.issue.update({
    where: { id: issue.id },
    data: {
      stateId: initialMapping.state.id,
      iterationId: sourceIterationId,
      assigneeId: sourceOnlyAssignee.id,
    },
  })

  const scopeField = await db.workItemFieldDefinition.findFirstOrThrow({
    where: { projectId: sourceProject.id, workItemTypeId: sourceType.id, key: 'scope' },
  })
  await db.workItemFieldValue.create({
    data: {
      issueId: issue.id,
      projectId: sourceProject.id,
      fieldDefinitionId: scopeField.id,
      stringValue: 'In Scope',
    },
  })
  return updated
}

test('cross-project move remaps core project-owned data and increments the version', async () => {
  const issue = await createMovableIssue('Move core integrity')
  const sourceLabel = await db.label.create({
    data: { projectId: sourceProject.id, name: 'Shared move label' },
  })
  const sourceOnlyLabel = await db.label.create({
    data: { projectId: sourceProject.id, name: 'Source-only move label' },
  })
  const targetLabel = await db.label.create({
    data: { projectId: targetProject.id, name: sourceLabel.name },
  })
  await db.issueLabel.createMany({
    data: [
      { issueId: issue.id, labelId: sourceLabel.id },
      { issueId: issue.id, labelId: sourceOnlyLabel.id },
    ],
  })

  const response = await bulkMove([issue.id])
  assert.equal(response.status, 200)

  const moved = await db.issue.findUniqueOrThrow({
    where: { id: issue.id },
    include: {
      stateRecord: true,
      labels: { include: { label: true } },
      fieldValues: { include: { fieldDefinition: true } },
    },
  })
  assert.equal(moved.projectId, targetProject.id)
  assert.match(moved.key, /^MOVEDST-\d+$/)
  assert.equal(moved.areaId, null)
  assert.equal(moved.iterationId, null)
  assert.equal(moved.assigneeId, null)
  assert.equal(moved.version, issue.version + 1)
  assert.equal(moved.stateRecord?.projectId, targetProject.id)
  assert.equal(statusFromStateCategory(moved.stateRecord?.category ?? ''), moved.status)
  assert.deepEqual(moved.labels.map((entry) => entry.labelId), [targetLabel.id])
  assert.equal(moved.labels[0]?.label.projectId, targetProject.id)
  assert.equal(moved.fieldValues.length, 1)
  assert.equal(moved.fieldValues[0]?.projectId, targetProject.id)
  assert.equal(moved.fieldValues[0]?.fieldDefinition.projectId, targetProject.id)
  assert.equal(moved.fieldValues[0]?.fieldDefinition.key, 'scope')
  assert.equal(moved.fieldValues[0]?.stringValue, 'In Scope')
})

test('cross-project move removes or retargets every source-owned issue relation', async () => {
  const movedIssue = await createMovableIssue('Move linked integrity')
  const sourcePeer = await createMovableIssue('Source peer')
  const child = await createMovableIssue('Unselected child')
  await db.issue.update({ where: { id: child.id }, data: { parentIssueId: movedIssue.id } })
  await db.issueRelation.create({
    data: { sourceIssueId: movedIssue.id, targetIssueId: sourcePeer.id, relationType: 'related' },
  })

  const activity = await db.activity.create({
    data: {
      projectId: sourceProject.id,
      issueId: movedIssue.id,
      userId: admin.id,
      action: 'seed_move_activity',
    },
  })
  const notification = await db.notification.create({
    data: {
      projectId: sourceProject.id,
      issueId: movedIssue.id,
      userId: admin.id,
      type: 'seed_move_notification',
      title: 'Seed move notification',
    },
  })
  const automationRule = await db.automationRule.create({
    data: {
      projectId: sourceProject.id,
      name: 'Move source automation',
      trigger: { type: 'issue:updated' },
      actions: [],
    },
  })
  const automationLog = await db.automationLog.create({
    data: {
      ruleId: automationRule.id,
      projectId: sourceProject.id,
      issueId: movedIssue.id,
      status: 'success',
    },
  })

  const sourceType = await db.workItemTypeDefinition.findUniqueOrThrow({
    where: { projectId_key: { projectId: sourceProject.id, key: 'task' } },
  })
  const transition = await db.stateTransition.findFirstOrThrow({
    where: { projectId: sourceProject.id, workItemTypeId: sourceType.id },
  })
  await db.approvalRequest.create({
    data: {
      issueId: movedIssue.id,
      transitionId: transition.id,
      requestedById: admin.id,
      fromStateId: transition.fromStateId,
      toStateId: transition.toStateId,
    },
  })
  const slaPolicy = await db.slaPolicy.create({
    data: { projectId: sourceProject.id, name: 'Move source SLA' },
  })
  await db.slaTimer.create({
    data: {
      issueId: movedIssue.id,
      policyId: slaPolicy.id,
      timerType: 'resolution',
      targetAt: new Date(Date.now() + 86_400_000),
    },
  })

  const objective = await db.objective.create({
    data: { projectId: sourceProject.id, title: 'Move source objective' },
  })
  const keyResult = await db.keyResult.create({
    data: { objectiveId: objective.id, title: 'Move source key result', issueId: movedIssue.id },
  })
  const retrospective = await db.retrospective.create({
    data: { projectId: sourceProject.id, title: 'Move source retrospective' },
  })
  const retroItem = await db.retroItem.create({
    data: {
      retrospectiveId: retrospective.id,
      category: 'action',
      content: 'Move source action',
      actionItemIssueId: movedIssue.id,
    },
  })
  const testCase = await db.testCase.create({
    data: {
      projectId: sourceProject.id,
      title: 'Move source test case',
      linkedIssueId: movedIssue.id,
    },
  })
  const testRun = await db.testRun.create({
    data: { testCaseId: testCase.id, linkedIssueId: movedIssue.id },
  })

  const response = await bulkMove([movedIssue.id])
  assert.equal(response.status, 200)

  assert.equal(await db.issueRelation.count({ where: { sourceIssueId: movedIssue.id } }), 0)
  const detachedChild = await db.issue.findUniqueOrThrow({ where: { id: child.id } })
  assert.equal(detachedChild.parentIssueId, null)
  assert.equal(detachedChild.version, child.version + 1)
  assert.equal((await db.activity.findUniqueOrThrow({ where: { id: activity.id } })).projectId, targetProject.id)
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).projectId, targetProject.id)
  assert.equal((await db.automationLog.findUniqueOrThrow({ where: { id: automationLog.id } })).issueId, null)
  assert.equal(await db.approvalRequest.count({ where: { issueId: movedIssue.id } }), 0)
  assert.equal(await db.slaTimer.count({ where: { issueId: movedIssue.id, policyId: slaPolicy.id } }), 0)
  assert.equal((await db.keyResult.findUniqueOrThrow({ where: { id: keyResult.id } })).issueId, null)
  assert.equal((await db.retroItem.findUniqueOrThrow({ where: { id: retroItem.id } })).actionItemIssueId, null)
  assert.equal((await db.testCase.findUniqueOrThrow({ where: { id: testCase.id } })).linkedIssueId, null)
  assert.equal((await db.testRun.findUniqueOrThrow({ where: { id: testRun.id } })).linkedIssueId, null)
})

test('move rejects the source project and archived targets without mutating the issue', async () => {
  const issue = await createMovableIssue('Reject invalid targets')

  const sameProject = await bulkMove([issue.id], sourceProject.id)
  assert.equal(sameProject.status, 400)

  await db.project.update({ where: { id: targetProject.id }, data: { isArchived: true } })
  const archived = await bulkMove([issue.id])
  assert.equal(archived.status, 400)

  const persisted = await db.issue.findUniqueOrThrow({ where: { id: issue.id } })
  assert.equal(persisted.projectId, sourceProject.id)
  assert.equal(persisted.key, issue.key)
  assert.equal(persisted.version, issue.version)
})

test('move reports an unsupported target work-item type as a validation error', async () => {
  const firstIssue = await createMovableIssue('Reject unsupported target type one')
  const secondIssue = await createMovableIssue('Reject unsupported target type two')
  const targetType = await db.workItemTypeDefinition.findUniqueOrThrow({
    where: { projectId_key: { projectId: targetProject.id, key: firstIssue.workItemType } },
  })
  await db.workItemTypeDefinition.delete({ where: { id: targetType.id } })

  const response = await bulkMove([firstIssue.id, secondIssue.id])
  assert.equal(response.status, 400)

  const persisted = await db.issue.findMany({
    where: { id: { in: [firstIssue.id, secondIssue.id] } },
  })
  assert.equal(persisted.length, 2)
  for (const issue of persisted) {
    assert.equal(issue.projectId, sourceProject.id)
    assert.equal(issue.version, 1)
  }
})

test('move rejects target custom-field rules that would invalidate preserved data', async () => {
  const issue = await createMovableIssue('Reject incompatible target field')
  const targetType = await db.workItemTypeDefinition.findUniqueOrThrow({
    where: { projectId_key: { projectId: targetProject.id, key: issue.workItemType } },
  })
  await db.workItemFieldDefinition.updateMany({
    where: { projectId: targetProject.id, workItemTypeId: targetType.id, key: 'scope' },
    data: { options: ['Out of Scope'] },
  })

  const response = await bulkMove([issue.id])
  assert.equal(response.status, 400)
  const persisted = await db.issue.findUniqueOrThrow({ where: { id: issue.id } })
  assert.equal(persisted.projectId, sourceProject.id)
  assert.equal(persisted.version, issue.version)
})

test('move preserves hierarchy, links, and valid assignments entirely inside the moved set', async () => {
  const parent = await createMovableIssue('Moved parent')
  const child = await createMovableIssue('Moved child')
  await db.issue.update({ where: { id: child.id }, data: { parentIssueId: parent.id } })
  const relation = await db.issueRelation.create({
    data: { sourceIssueId: parent.id, targetIssueId: child.id, relationType: 'related' },
  })
  await addMember(targetProject.id, sourceOnlyAssignee.id, 'Dev')

  const response = await bulkMove([parent.id, child.id])
  assert.equal(response.status, 200)

  const movedChild = await db.issue.findUniqueOrThrow({ where: { id: child.id } })
  assert.equal(movedChild.projectId, targetProject.id)
  assert.equal(movedChild.parentIssueId, parent.id)
  assert.equal(movedChild.assigneeId, sourceOnlyAssignee.id)
  assert.ok(await db.issueRelation.findUnique({ where: { id: relation.id } }))
})

test('move cannot carry an assignment through a target assignment ACL denial', async () => {
  const issue = await createMovableIssue('Reject target assignment bypass')
  await addMember(targetProject.id, sourceOnlyAssignee.id, 'Dev')
  await db.projectPermissionRule.create({
    data: {
      projectId: targetProject.id,
      role: 'Admin',
      permission: 'workitem:assign',
      effect: 'deny',
    },
  })
  await invalidateProjectPermissionRuleCache(targetProject.id)

  const response = await bulkMove([issue.id])
  assert.equal(response.status, 403)
  const persisted = await db.issue.findUniqueOrThrow({ where: { id: issue.id } })
  assert.equal(persisted.projectId, sourceProject.id)
  assert.equal(persisted.assigneeId, sourceOnlyAssignee.id)
  assert.equal(persisted.version, issue.version)
})

test('move cannot carry work-item links through a target link ACL denial', async () => {
  const firstIssue = await createMovableIssue('Reject target link bypass one')
  const secondIssue = await createMovableIssue('Reject target link bypass two')
  await db.issueRelation.create({
    data: {
      sourceIssueId: firstIssue.id,
      targetIssueId: secondIssue.id,
      relationType: 'related',
    },
  })
  await db.projectPermissionRule.create({
    data: {
      projectId: targetProject.id,
      role: 'Admin',
      permission: 'workitem:link',
      effect: 'deny',
    },
  })
  await invalidateProjectPermissionRuleCache(targetProject.id)

  const response = await bulkMove([firstIssue.id, secondIssue.id])
  assert.equal(response.status, 403)
  assert.equal(
    await db.issue.count({
      where: {
        id: { in: [firstIssue.id, secondIssue.id] },
        projectId: sourceProject.id,
        version: 1,
      },
    }),
    2
  )
})
