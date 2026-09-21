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
import { GET as approvalsGet } from '../../src/app/api/approvals/route.ts'

let project: Awaited<ReturnType<typeof createProject>>
let otherProject: Awaited<ReturnType<typeof createProject>>
let admin: SeededUser
let viewer: SeededUser

before(async () => {
  await resetDatabase()

  project = await createProject({ key: 'APPA' })
  otherProject = await createProject({ key: 'APPB' })
  admin = await createUser()
  viewer = await createUser()

  await addMember(project.id, admin.id, 'Admin')
  await addMember(project.id, viewer.id, 'Viewer')
})

after(async () => {
  await disconnect()
})

beforeEach(async () => {
  await db.issue.deleteMany({})
  await db.projectPermissionRule.deleteMany({
    where: { projectId: { in: [project.id, otherProject.id] } },
  })
  await Promise.all([
    invalidateProjectPermissionRuleCache(project.id),
    invalidateProjectPermissionRuleCache(otherProject.id),
  ])
})

async function createApproval(options: {
  projectId: string
  title: string
  status?: string
  areaId?: string | null
  approverIds?: string[]
}) {
  const issue = await createIssue({
    projectId: options.projectId,
    reporterId: admin.id,
    title: options.title,
    areaId: options.areaId,
  })

  const approval = await db.approvalRequest.create({
    data: {
      issueId: issue.id,
      requestedById: admin.id,
      status: options.status ?? 'pending',
      approverUserIds: options.approverIds ?? [viewer.id],
      reason: `Approval for ${options.title}`,
    },
  })

  return { approval, issue }
}

test('approval listing returns records only from the authorized project', async () => {
  await createApproval({ projectId: project.id, title: 'Visible approval' })
  await createApproval({ projectId: otherProject.id, title: 'Other project secret' })

  const response = await readResponse<Array<{ issue: { title: string } }>>(
    await approvalsGet(authedRequest(viewer, `/api/approvals?projectId=${project.id}`))
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.body?.map((approval) => approval.issue.title), ['Visible approval'])
})

test('an issueId cannot escape the project used for authorization', async () => {
  const { issue } = await createApproval({
    projectId: otherProject.id,
    title: 'Mismatched project secret',
  })

  const response = await readResponse<unknown[]>(
    await approvalsGet(
      authedRequest(viewer, `/api/approvals?projectId=${project.id}&issueId=${issue.id}`)
    )
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, [])
})

test('pending listing stays project-scoped and returns only approvals assigned to the actor', async () => {
  await createApproval({ projectId: project.id, title: 'Assigned pending' })
  await createApproval({
    projectId: project.id,
    title: 'Assigned but resolved',
    status: 'approved',
  })
  await createApproval({
    projectId: project.id,
    title: 'Pending for another user',
    approverIds: [admin.id],
  })
  await createApproval({ projectId: otherProject.id, title: 'Other project pending' })

  const response = await readResponse<Array<{ issue: { title: string } }>>(
    await approvalsGet(
      authedRequest(viewer, `/api/approvals?pending=true&projectId=${project.id}`)
    )
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.body?.map((approval) => approval.issue.title), ['Assigned pending'])
})

test('approval listing excludes issues in areas denied by work-item read ACLs', async () => {
  const allowedArea = await db.area.findFirstOrThrow({
    where: { projectId: project.id },
    select: { id: true },
  })
  const deniedArea = await db.area.create({
    data: {
      projectId: project.id,
      name: 'Restricted approvals',
      path: 'Restricted approvals',
      pathSegments: ['Restricted approvals'],
    },
    select: { id: true },
  })

  await createApproval({ projectId: project.id, title: 'Allowed area', areaId: allowedArea.id })
  await createApproval({ projectId: project.id, title: 'Denied area', areaId: deniedArea.id })
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

  const response = await readResponse<Array<{ issue: { title: string } }>>(
    await approvalsGet(authedRequest(viewer, `/api/approvals?projectId=${project.id}`))
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.body?.map((approval) => approval.issue.title), ['Allowed area'])
})

test('approval listing supports a work-item read grant limited to one area', async () => {
  const allowedArea = await db.area.findFirstOrThrow({
    where: { projectId: project.id },
    select: { id: true },
  })
  const hiddenArea = await db.area.create({
    data: {
      projectId: project.id,
      name: 'Outside scoped grant',
      path: 'Outside scoped grant',
      pathSegments: ['Outside scoped grant'],
    },
    select: { id: true },
  })

  await createApproval({ projectId: project.id, title: 'Granted area', areaId: allowedArea.id })
  await createApproval({ projectId: project.id, title: 'Outside grant', areaId: hiddenArea.id })
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
        areaId: allowedArea.id,
        role: 'Viewer',
        permission: 'workitem:read',
        effect: 'allow',
      },
    ],
  })
  await invalidateProjectPermissionRuleCache(project.id)

  const response = await readResponse<Array<{ issue: { title: string } }>>(
    await approvalsGet(authedRequest(viewer, `/api/approvals?projectId=${project.id}`))
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.body?.map((approval) => approval.issue.title), ['Granted area'])
})
