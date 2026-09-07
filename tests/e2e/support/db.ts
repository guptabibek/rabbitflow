import { db } from '../../../src/lib/db'
import { hashPassword } from '../../../src/lib/auth'
import { ensureProjectSystemRecords } from '../../../src/lib/domain/project-bootstrap'
import { seedOnboardingSteps } from '../../../src/lib/domain/onboarding-engine'
import {
  E2E_PREFIX,
  E2E_TEST_PASSWORD,
  TEST_ACCOUNTS,
  makeIssueTitle,
  makeNotificationTitle,
  makeProjectKey,
  makeProjectName,
} from './env'

type ProjectRole = 'Admin' | 'PM' | 'DevOps' | 'Dev' | 'QA' | 'Viewer'

type EnsureUserInput = {
  email: string
  name: string
  globalRole?: 'admin' | 'member'
}

type CreateProjectInput = {
  ownerEmail?: string
  name?: string
  key?: string
  description?: string
  color?: string
}

type CreateTeamInput = {
  projectId: string
  name?: string
  key?: string
  leadEmail?: string
  createdByEmail?: string
}

type CreateIssueInput = {
  projectId: string
  reporterEmail?: string
  assigneeEmail?: string
  title?: string
  description?: string
  status?: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
  priority?: 'lowest' | 'low' | 'medium' | 'high' | 'highest'
}

type CreateNotificationInput = {
  email: string
  projectId?: string | null
  issueId?: string | null
  title?: string
  body?: string | null
  entityType?: string | null
  entityId?: string | null
  actorEmail?: string | null
}

export async function ensureUserAccount({
  email,
  name,
  globalRole = 'member',
}: EnsureUserInput) {
  const passwordHash = await hashPassword(E2E_TEST_PASSWORD)

  return db.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      globalRole,
      isActive: true,
      mustResetPassword: false,
      failedLoginAttempts: 0,
      lockoutUntil: null,
      mfaEnabled: false,
      mfaSecret: null,
      mfaExemptFromPolicy: true,
      mfaReenrollRequired: false,
    },
    create: {
      email,
      name,
      passwordHash,
      globalRole,
      isActive: true,
      mustResetPassword: false,
      mfaEnabled: false,
      mfaExemptFromPolicy: true,
      mfaReenrollRequired: false,
    },
  })
}

export async function ensureBaseUsers() {
  return Promise.all([
    ensureUserAccount(TEST_ACCOUNTS.admin),
    ensureUserAccount(TEST_ACCOUNTS.member),
    ensureUserAccount(TEST_ACCOUNTS.viewer),
  ])
}

export async function resetE2EArtifacts() {
  await db.notification.deleteMany({
    where: {
      title: {
        startsWith: `${E2E_PREFIX}:`,
      },
    },
  })

  await db.project.deleteMany({
    where: {
      OR: [
        { name: { startsWith: `${E2E_PREFIX}-` } },
        { key: { startsWith: E2E_PREFIX } },
      ],
    },
  })

  await db.user.deleteMany({
    where: {
      email: {
        startsWith: 'signup.',
      },
    },
  })
}

export async function createProjectFixture({
  ownerEmail = TEST_ACCOUNTS.admin.email,
  name = makeProjectName('project'),
  key = makeProjectKey(),
  description = `${E2E_PREFIX}: ${name}`,
  color = '#16a34a',
}: CreateProjectInput = {}) {
  const owner = await db.user.findUniqueOrThrow({
    where: { email: ownerEmail },
    select: { id: true },
  })

  const project = await db.project.create({
    data: {
      name,
      key,
      description,
      color,
      members: {
        create: {
          userId: owner.id,
          role: 'Admin',
        },
      },
    },
  })

  await ensureProjectSystemRecords(project.id, owner.id)
  await seedOnboardingSteps(project.id)

  return project
}

export async function addProjectMember({
  projectId,
  email,
  role,
}: {
  projectId: string
  email: string
  role: ProjectRole
}) {
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, email: true, name: true },
  })

  return db.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId,
        userId: user.id,
      },
    },
    update: {
      role,
    },
    create: {
      projectId,
      userId: user.id,
      role,
    },
  })
}

export async function createTeamFixture({
  projectId,
  name = makeProjectName('team'),
  key = makeProjectKey(),
  leadEmail = TEST_ACCOUNTS.admin.email,
  createdByEmail = TEST_ACCOUNTS.admin.email,
}: CreateTeamInput) {
  const [lead, creator] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { email: leadEmail }, select: { id: true } }),
    db.user.findUniqueOrThrow({ where: { email: createdByEmail }, select: { id: true } }),
  ])

  return db.team.create({
    data: {
      projectId,
      name,
      key,
      leadId: lead.id,
      createdById: creator.id,
      members: {
        create: {
          userId: lead.id,
          role: 'lead',
        },
      },
    },
  })
}

export async function createLabelFixture(projectId: string, name = makeProjectName('label')) {
  return db.label.create({
    data: {
      projectId,
      name,
      color: '#0ea5e9',
    },
  })
}

export async function createSprintFixture(projectId: string, teamId?: string | null) {
  const name = makeProjectName('sprint')
  return db.iteration.create({
    data: {
      projectId,
      teamId: teamId ?? null,
      name,
      path: name,
      iterationType: 'sprint',
      status: 'Planned',
    },
  })
}

export async function createIssueFixture({
  projectId,
  reporterEmail = TEST_ACCOUNTS.admin.email,
  assigneeEmail,
  title = makeIssueTitle('issue'),
  description = `${E2E_PREFIX}: seeded issue`,
  status = 'todo',
  priority = 'medium',
}: CreateIssueInput) {
  const [project, reporter, assignee, state, existingCount] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, key: true } }),
    db.user.findUniqueOrThrow({ where: { email: reporterEmail }, select: { id: true } }),
    assigneeEmail
      ? db.user.findUnique({ where: { email: assigneeEmail }, select: { id: true } })
      : Promise.resolve(null),
    db.state.findFirst({
      where: { projectId, category: status },
      orderBy: { order: 'asc' },
      select: { id: true },
    }),
    db.issue.count({ where: { projectId } }),
  ])

  const issueNumber = existingCount + 1

  return db.issue.create({
    data: {
      projectId: project.id,
      key: `${project.key}-${issueNumber}`,
      title,
      description,
      workItemType: 'task',
      status,
      priority,
      reporterId: reporter.id,
      assigneeId: assignee?.id ?? null,
      stateId: state?.id ?? null,
      columnOrder: issueNumber * 10,
    },
  })
}

export async function createNotificationFixture({
  email,
  projectId = null,
  issueId = null,
  title = makeNotificationTitle('notification'),
  body = `${E2E_PREFIX}: notification body`,
  entityType = issueId ? 'issue' : null,
  entityId = issueId,
  actorEmail = TEST_ACCOUNTS.admin.email,
}: CreateNotificationInput) {
  const [user, actor] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { email }, select: { id: true } }),
    actorEmail
      ? db.user.findUnique({ where: { email: actorEmail }, select: { id: true } })
      : Promise.resolve(null),
  ])

  return db.notification.create({
    data: {
      userId: user.id,
      projectId,
      issueId,
      actorId: actor?.id ?? null,
      type: 'assignment',
      title,
      body,
      entityType,
      entityId,
    },
  })
}

export async function findProjectByName(name: string) {
  return db.project.findFirst({ where: { name } })
}

export async function findProjectByKey(key: string) {
  return db.project.findFirst({ where: { key } })
}

export async function getUserByEmail(email: string) {
  return db.user.findUnique({ where: { email } })
}

export async function deleteUserByEmail(email: string) {
  return db.user.deleteMany({ where: { email } })
}

export async function getProjectMemberCount(projectId: string) {
  return db.projectMember.count({ where: { projectId } })
}

export async function findIssueByTitle(projectId: string, title: string) {
  return db.issue.findFirst({
    where: { projectId, title },
    include: {
      assignee: true,
      stateRecord: true,
    },
  })
}

export async function getDoneState(projectId: string) {
  return db.state.findFirst({
    where: {
      projectId,
      OR: [{ category: 'done' }, { isFinal: true }],
    },
    orderBy: { order: 'asc' },
  })
}

export async function getNotificationByTitle(email: string, title: string) {
  const user = await db.user.findUniqueOrThrow({ where: { email }, select: { id: true } })
  return db.notification.findFirst({
    where: {
      userId: user.id,
      title,
    },
  })
}
/**
 * A state the issue can legally move to in one step.
 *
 * The workflow is a real state machine: `New → Development in Progress → …`,
 * and `PUT /api/issues/:id` rejects anything else with "Invalid workflow
 * transition". Tests that want to prove a state change saves should ask for a
 * reachable target rather than jumping to Done, which is several hops away and
 * fails for reasons that have nothing to do with what they are testing.
 *
 * Falls back to any other state mapped to the type when a project has no
 * explicit transitions, which is the same "allow anything mapped" rule the
 * server applies in that case.
 */
export async function getAllowedNextState(issueId: string) {
  const issue = await db.issue.findUniqueOrThrow({
    where: { id: issueId },
    select: { projectId: true, stateId: true, workItemType: true },
  })

  const type = await db.workItemTypeDefinition.findFirst({
    where: { projectId: issue.projectId, key: issue.workItemType },
    select: { id: true },
  })

  if (!type || !issue.stateId) return null

  const transition = await db.stateTransition.findFirst({
    where: {
      projectId: issue.projectId,
      workItemTypeId: type.id,
      fromStateId: issue.stateId,
      isEnabled: true,
    },
    orderBy: { order: 'asc' },
    select: { toState: true },
  })

  if (transition) return transition.toState

  const mapping = await db.workItemTypeStateMapping.findFirst({
    where: { workItemTypeId: type.id, stateId: { not: issue.stateId } },
    select: { state: true },
  })

  return mapping?.state ?? null
}

/**
 * Put an issue into the project's Done state directly.
 *
 * The workflow is a state machine, so reaching Done from New takes six legal
 * hops. Where "a completed work item exists" is a *precondition* rather than
 * the thing under test — the onboarding checklist, for instance — driving all
 * six through the UI adds minutes and failure surface without testing more.
 * The transition rules themselves are covered by the API tests.
 */
export async function completeIssue(issueId: string) {
  const issue = await db.issue.findUniqueOrThrow({
    where: { id: issueId },
    select: { projectId: true },
  })

  const done = await getDoneState(issue.projectId)
  if (!done) throw new Error(`Project ${issue.projectId} has no Done state`)

  await db.issue.update({
    where: { id: issueId },
    data: { stateId: done.id, status: 'done' },
  })

  return done
}
