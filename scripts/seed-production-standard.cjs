/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const db = new PrismaClient()

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const projectKey = requiredEnv('SEED_PROJECT_KEY').toUpperCase()
const adminEmail = requiredEnv('SEED_ADMIN_EMAIL').toLowerCase()
const adminPassword = requiredEnv('SEED_ADMIN_PASSWORD')
const organizationName = requiredEnv('SEED_ORGANIZATION_NAME')
const productName = process.env.SEED_PRODUCT_NAME?.trim() || 'RabbitFlow'
const supportEmail = process.env.SEED_SUPPORT_EMAIL?.trim() || adminEmail
const customDomain = process.env.SEED_CUSTOM_DOMAIN?.trim() || null

const STATES = [
  ['backlog', 'Backlog', '#64748b', 'Proposed', false],
  ['proposed', 'Proposed', '#475569', 'Proposed', false],
  ['triage', 'Triage', '#a16207', 'Proposed', false],
  ['discovery', 'Discovery', '#7c3aed', 'Proposed', false],
  ['design', 'Design', '#9333ea', 'Proposed', false],
  ['design_review', 'Design Review', '#6d28d9', 'In Progress', false],
  ['ready', 'Ready', '#2563eb', 'Proposed', false],
  ['in_progress', 'In Progress', '#0284c7', 'In Progress', false],
  ['blocked', 'Blocked', '#dc2626', 'In Progress', false],
  ['code_review', 'Code Review', '#4f46e5', 'In Progress', false],
  ['ready_qa', 'Ready for QA', '#0891b2', 'In Progress', false],
  ['qa', 'QA In Progress', '#0e7490', 'In Progress', false],
  ['returned', 'Returned to Development', '#b45309', 'In Progress', false],
  ['acceptance', 'Acceptance Testing', '#0f766e', 'In Progress', false],
  ['ready_release', 'Ready for Release', '#15803d', 'In Progress', false],
  ['deploying', 'Deploying', '#ea580c', 'In Progress', false],
  ['validating', 'Validating', '#059669', 'In Progress', false],
  ['mitigated', 'Mitigated', '#65a30d', 'In Progress', false],
  ['rca', 'Root Cause Analysis', '#be123c', 'In Progress', false],
  ['resolved', 'Resolved', '#16a34a', 'In Progress', false],
  ['rolled_back', 'Rolled Back', '#c2410c', 'In Progress', false],
  ['approved', 'Approved', '#15803d', 'Completed', true],
  ['done', 'Done', '#16a34a', 'Completed', true],
  ['released', 'Released', '#22c55e', 'Completed', true],
  ['closed', 'Closed', '#166534', 'Completed', true],
  ['cancelled', 'Cancelled', '#6b7280', 'Completed', true],
].map(([key, name, color, category, isFinal], index) => ({
  key,
  name,
  color,
  category,
  isFinal,
  order: (index + 1) * 10,
}))

const approval = (roles, minApprovals = 1) => ({
  requiresApproval: true,
  approverRoles: roles,
  minApprovals,
})

const WORKFLOWS = {
  epic: {
    states: ['proposed', 'discovery', 'ready', 'in_progress', 'blocked', 'acceptance', 'done', 'cancelled'],
    edges: [
      ['proposed', 'discovery'], ['discovery', 'proposed'], ['discovery', 'ready'],
      ['ready', 'discovery'], ['ready', 'in_progress'], ['in_progress', 'ready'],
      ['in_progress', 'blocked'], ['blocked', 'in_progress'],
      ['in_progress', 'acceptance'], ['acceptance', 'in_progress'],
      ['acceptance', 'done'], ['done', 'in_progress'],
    ],
  },
  feature: {
    states: ['proposed', 'discovery', 'ready', 'in_progress', 'blocked', 'acceptance', 'ready_release', 'released', 'cancelled'],
    edges: [
      ['proposed', 'discovery'], ['discovery', 'proposed'], ['discovery', 'ready'],
      ['ready', 'discovery'], ['ready', 'in_progress'], ['in_progress', 'ready'],
      ['in_progress', 'blocked'], ['blocked', 'in_progress'],
      ['in_progress', 'acceptance'], ['acceptance', 'in_progress'],
      ['acceptance', 'ready_release'], ['ready_release', 'acceptance'],
      ['ready_release', 'released'], ['released', 'in_progress'],
    ],
  },
  story: {
    states: ['backlog', 'ready', 'in_progress', 'blocked', 'code_review', 'returned', 'ready_qa', 'qa', 'acceptance', 'done', 'cancelled'],
    edges: [
      ['backlog', 'ready'], ['ready', 'backlog'], ['ready', 'in_progress'],
      ['in_progress', 'ready'], ['in_progress', 'blocked'], ['blocked', 'in_progress'],
      ['in_progress', 'code_review'], ['code_review', 'returned'],
      ['returned', 'in_progress'], ['code_review', 'ready_qa'],
      ['ready_qa', 'qa'], ['qa', 'returned'], ['qa', 'acceptance'],
      ['acceptance', 'returned'], ['acceptance', 'done'], ['done', 'backlog'],
    ],
  },
  task: {
    states: ['backlog', 'ready', 'in_progress', 'blocked', 'code_review', 'returned', 'ready_qa', 'qa', 'done', 'cancelled'],
    edges: [
      ['backlog', 'ready'], ['ready', 'backlog'], ['ready', 'in_progress'],
      ['in_progress', 'ready'], ['in_progress', 'blocked'], ['blocked', 'in_progress'],
      ['in_progress', 'code_review'], ['in_progress', 'done'],
      ['code_review', 'returned'], ['returned', 'in_progress'],
      ['code_review', 'ready_qa'], ['ready_qa', 'qa'],
      ['qa', 'returned'], ['qa', 'done'], ['done', 'backlog'],
    ],
  },
  dev_task: {
    states: ['backlog', 'ready', 'in_progress', 'blocked', 'code_review', 'returned', 'ready_qa', 'qa', 'done', 'cancelled'],
    edges: [
      ['backlog', 'ready'], ['ready', 'backlog'], ['ready', 'in_progress'],
      ['in_progress', 'ready'], ['in_progress', 'blocked'], ['blocked', 'in_progress'],
      ['in_progress', 'code_review'], ['code_review', 'returned'],
      ['returned', 'in_progress'], ['code_review', 'ready_qa'],
      ['ready_qa', 'qa'], ['qa', 'returned'], ['qa', 'done'], ['done', 'backlog'],
    ],
  },
  qc_task: {
    states: ['backlog', 'ready_qa', 'qa', 'blocked', 'returned', 'done', 'cancelled'],
    edges: [
      ['backlog', 'ready_qa'], ['ready_qa', 'backlog'], ['ready_qa', 'qa'],
      ['qa', 'blocked'], ['blocked', 'qa'], ['qa', 'returned'],
      ['returned', 'ready_qa'], ['qa', 'done'], ['done', 'backlog'],
    ],
  },
  bug: {
    states: ['triage', 'ready', 'in_progress', 'blocked', 'code_review', 'returned', 'ready_qa', 'qa', 'resolved', 'closed', 'cancelled'],
    edges: [
      ['triage', 'ready'], ['ready', 'triage'], ['ready', 'in_progress'],
      ['in_progress', 'ready'], ['in_progress', 'blocked'], ['blocked', 'in_progress'],
      ['in_progress', 'code_review'], ['code_review', 'returned'],
      ['returned', 'in_progress'], ['code_review', 'ready_qa'],
      ['ready_qa', 'qa'], ['qa', 'returned'], ['qa', 'resolved'],
      ['resolved', 'qa'], ['resolved', 'closed'], ['closed', 'triage'],
    ],
  },
  prod_bug: {
    states: ['triage', 'in_progress', 'blocked', 'mitigated', 'rca', 'ready', 'code_review', 'returned', 'ready_qa', 'qa', 'resolved', 'closed', 'cancelled'],
    edges: [
      ['triage', 'in_progress'], ['in_progress', 'blocked'], ['blocked', 'in_progress'],
      ['in_progress', 'mitigated'], ['mitigated', 'in_progress'],
      ['mitigated', 'rca'], ['rca', 'ready'], ['ready', 'in_progress'],
      ['in_progress', 'code_review'], ['code_review', 'returned'],
      ['returned', 'in_progress'], ['code_review', 'ready_qa'],
      ['ready_qa', 'qa'], ['qa', 'returned'], ['qa', 'resolved'],
      ['resolved', 'qa'], ['resolved', 'closed', approval(['Admin', 'PM', 'QA'])],
      ['closed', 'triage'],
    ],
  },
  design_doc: {
    states: ['proposed', 'discovery', 'design', 'design_review', 'returned', 'approved', 'cancelled'],
    edges: [
      ['proposed', 'discovery'], ['discovery', 'proposed'], ['discovery', 'design'],
      ['design', 'discovery'], ['design', 'design_review'],
      ['design_review', 'returned'], ['returned', 'design'],
      ['design_review', 'approved', approval(['Admin', 'PM'])],
      ['approved', 'design'],
    ],
  },
  release_item: {
    states: ['proposed', 'ready', 'deploying', 'validating', 'rolled_back', 'released', 'cancelled'],
    edges: [
      ['proposed', 'ready'], ['ready', 'proposed'],
      ['ready', 'deploying', approval(['Admin', 'DevOps'])],
      ['deploying', 'validating'], ['deploying', 'rolled_back'],
      ['validating', 'deploying'], ['validating', 'rolled_back'],
      ['rolled_back', 'ready'],
      ['validating', 'released', approval(['Admin', 'PM', 'QA', 'DevOps'])],
      ['released', 'proposed'],
    ],
  },
}

const LABELS = [
  ['customer-impact', '#dc2626'],
  ['security', '#7c3aed'],
  ['performance', '#ea580c'],
  ['accessibility', '#0891b2'],
  ['technical-debt', '#64748b'],
  ['blocked', '#b91c1c'],
  ['needs-design', '#8b5cf6'],
  ['needs-qa', '#0e7490'],
  ['release', '#16a34a'],
  ['documentation', '#2563eb'],
]

const SLA_POLICIES = [
  {
    name: 'P0 Critical Production Incident',
    description: '24/7 response target for critical production defects.',
    priorityFilter: ['critical'],
    typeFilter: ['prod_bug'],
    responseTimeMinutes: 15,
    resolutionTimeMinutes: 240,
    businessHoursOnly: false,
  },
  {
    name: 'P0 Critical Defect',
    description: 'Critical non-production defect response and resolution target.',
    priorityFilter: ['critical'],
    typeFilter: ['bug'],
    responseTimeMinutes: 30,
    resolutionTimeMinutes: 480,
    businessHoursOnly: false,
  },
  {
    name: 'P1 High Priority Defect',
    description: 'Business-hours target for high-priority defects.',
    priorityFilter: ['high'],
    typeFilter: ['bug', 'prod_bug'],
    responseTimeMinutes: 120,
    resolutionTimeMinutes: 1440,
    businessHoursOnly: true,
  },
]

function withCancellation(workflow) {
  const finalStates = new Set(['approved', 'done', 'released', 'closed', 'cancelled'])
  const edges = [...workflow.edges]
  for (const state of workflow.states) {
    if (!finalStates.has(state) && state !== 'cancelled') edges.push([state, 'cancelled'])
  }
  edges.push(['cancelled', workflow.states[0]])
  return edges
}

async function customizeProject() {
  const project = await db.project.findUnique({ where: { key: projectKey } })
  if (!project) throw new Error(`Bootstrap project ${projectKey} was not found`)

  const workItemCount = await db.issue.count({ where: { projectId: project.id } })
  if (workItemCount !== 0) throw new Error('Refusing to replace workflows in a project containing work items')

  await db.$transaction(async (tx) => {
    await tx.team.deleteMany({ where: { projectId: project.id } })
    await tx.stateTransition.deleteMany({ where: { projectId: project.id } })
    await tx.workItemTypeStateMapping.deleteMany({ where: { projectId: project.id } })
    await tx.state.deleteMany({ where: { projectId: project.id } })

    await tx.state.createMany({
      data: STATES.map(({ key: _key, ...state }) => ({ projectId: project.id, ...state })),
    })

    const [states, types] = await Promise.all([
      tx.state.findMany({ where: { projectId: project.id } }),
      tx.workItemTypeDefinition.findMany({ where: { projectId: project.id } }),
    ])

    const stateByName = new Map(states.map((state) => [state.name, state]))
    const stateDefinitionByKey = new Map(STATES.map((state) => [state.key, state]))
    const stateByKey = new Map(
      STATES.map((definition) => [definition.key, stateByName.get(definition.name)])
    )
    const typeByKey = new Map(types.map((type) => [type.key, type]))

    for (const [typeKey, workflow] of Object.entries(WORKFLOWS)) {
      const type = typeByKey.get(typeKey)
      if (!type) throw new Error(`Missing work-item type ${typeKey}`)

      await tx.workItemTypeStateMapping.createMany({
        data: workflow.states.map((stateKey, index) => {
          const state = stateByKey.get(stateKey)
          if (!state || !stateDefinitionByKey.has(stateKey)) throw new Error(`Missing state ${stateKey}`)
          return {
            projectId: project.id,
            workItemTypeId: type.id,
            stateId: state.id,
            order: index * 10,
            isInitial: index === 0,
          }
        }),
      })

      const uniqueEdges = new Map()
      for (const [fromKey, toKey, options = {}] of withCancellation(workflow)) {
        uniqueEdges.set(`${fromKey}:${toKey}`, { fromKey, toKey, options })
      }

      await tx.stateTransition.createMany({
        data: [...uniqueEdges.values()].map(({ fromKey, toKey, options }, index) => {
          const fromState = stateByKey.get(fromKey)
          const toState = stateByKey.get(toKey)
          if (!fromState || !toState) throw new Error(`Invalid transition ${fromKey} -> ${toKey}`)
          return {
            projectId: project.id,
            workItemTypeId: type.id,
            fromStateId: fromState.id,
            toStateId: toState.id,
            order: index * 10,
            isEnabled: true,
            requiresApproval: options.requiresApproval ?? false,
            approverRoles: options.approverRoles ?? undefined,
            minApprovals: options.minApprovals ?? 1,
          }
        }),
      })
    }

    await tx.label.deleteMany({ where: { projectId: project.id } })
    await tx.label.createMany({
      data: LABELS.map(([name, color]) => ({ projectId: project.id, name, color })),
    })

    await tx.slaPolicy.deleteMany({ where: { projectId: project.id } })
    await tx.slaPolicy.createMany({
      data: SLA_POLICIES.map((policy) => ({ projectId: project.id, ...policy })),
    })

    await tx.projectBranding.upsert({
      where: { projectId: project.id },
      update: {
        organizationName,
        productName,
        accentColor: project.color,
        supportEmail,
        customDomain,
        loginHeadline: 'Plan, build, test, and release with confidence.',
        loginSubcopy: 'A structured workspace for product, engineering, quality, and operations.',
      },
      create: {
        projectId: project.id,
        organizationName,
        productName,
        accentColor: project.color,
        supportEmail,
        customDomain,
        loginHeadline: 'Plan, build, test, and release with confidence.',
        loginSubcopy: 'A structured workspace for product, engineering, quality, and operations.',
      },
    })

    await tx.project.update({
      where: { id: project.id },
      data: { systemRecordsVersion: 1 },
    })
  }, { maxWait: 10_000, timeout: 60_000 })

  return project.id
}

async function validate(projectId) {
  const [
    users,
    projects,
    members,
    teams,
    iterations,
    issues,
    areas,
    typeRows,
    sections,
    fields,
    fieldMappings,
    stateRows,
    stateMappings,
    transitions,
    labels,
    slaPolicies,
    onboardingSteps,
    branding,
    admin,
  ] = await Promise.all([
    db.user.count(),
    db.project.count(),
    db.projectMember.count({ where: { projectId } }),
    db.team.count({ where: { projectId } }),
    db.iteration.count({ where: { projectId } }),
    db.issue.count({ where: { projectId } }),
    db.area.count({ where: { projectId } }),
    db.workItemTypeDefinition.findMany({ where: { projectId } }),
    db.workItemSectionDefinition.count({ where: { projectId } }),
    db.workItemFieldDefinition.count({ where: { projectId } }),
    db.workItemTypeFieldMapping.count({ where: { projectId } }),
    db.state.findMany({ where: { projectId } }),
    db.workItemTypeStateMapping.findMany({ where: { projectId } }),
    db.stateTransition.findMany({ where: { projectId } }),
    db.label.count({ where: { projectId } }),
    db.slaPolicy.count({ where: { projectId } }),
    db.onboardingStepConfig.count({ where: { projectId } }),
    db.projectBranding.count({ where: { projectId } }),
    db.user.findUnique({ where: { email: adminEmail } }),
  ])

  const expectedMappings = Object.values(WORKFLOWS).reduce((sum, workflow) => sum + workflow.states.length, 0)
  const expectedTransitions = Object.values(WORKFLOWS).reduce((sum, workflow) => {
    const unique = new Set(withCancellation(workflow).map(([from, to]) => `${from}:${to}`))
    return sum + unique.size
  }, 0)

  const passwordValid = Boolean(
    admin?.passwordHash && await bcrypt.compare(adminPassword, admin.passwordHash)
  )

  const initialCounts = new Map()
  for (const mapping of stateMappings) {
    if (mapping.isInitial) {
      initialCounts.set(mapping.workItemTypeId, (initialCounts.get(mapping.workItemTypeId) ?? 0) + 1)
    }
  }

  const mappedStateIdsByType = new Map()
  for (const mapping of stateMappings) {
    const ids = mappedStateIdsByType.get(mapping.workItemTypeId) ?? new Set()
    ids.add(mapping.stateId)
    mappedStateIdsByType.set(mapping.workItemTypeId, ids)
  }

  const invalidTransitions = transitions.filter((transition) => {
    const mapped = mappedStateIdsByType.get(transition.workItemTypeId)
    return !mapped?.has(transition.fromStateId) || !mapped?.has(transition.toStateId)
  })

  const stateById = new Map(stateRows.map((state) => [state.id, state]))
  const graphFailures = []

  for (const type of typeRows) {
    const mappings = stateMappings.filter((mapping) => mapping.workItemTypeId === type.id)
    const initial = mappings.filter((mapping) => mapping.isInitial)
    const mappedIds = new Set(mappings.map((mapping) => mapping.stateId))
    const finalIds = new Set(
      mappings
        .filter((mapping) => stateById.get(mapping.stateId)?.isFinal)
        .map((mapping) => mapping.stateId)
    )
    const typeTransitions = transitions.filter((transition) => transition.workItemTypeId === type.id)
    const outgoing = new Map()
    const incoming = new Map()

    for (const transition of typeTransitions) {
      const next = outgoing.get(transition.fromStateId) ?? new Set()
      next.add(transition.toStateId)
      outgoing.set(transition.fromStateId, next)

      const previous = incoming.get(transition.toStateId) ?? new Set()
      previous.add(transition.fromStateId)
      incoming.set(transition.toStateId, previous)
    }

    if (initial.length !== 1 || finalIds.size === 0) {
      graphFailures.push(type.key)
      continue
    }

    const reachable = new Set([initial[0].stateId])
    const forwardQueue = [initial[0].stateId]
    while (forwardQueue.length > 0) {
      const current = forwardQueue.shift()
      for (const next of outgoing.get(current) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next)
          forwardQueue.push(next)
        }
      }
    }

    const canReachFinal = new Set(finalIds)
    const reverseQueue = [...finalIds]
    while (reverseQueue.length > 0) {
      const current = reverseQueue.shift()
      for (const previous of incoming.get(current) ?? []) {
        if (!canReachFinal.has(previous)) {
          canReachFinal.add(previous)
          reverseQueue.push(previous)
        }
      }
    }

    if (
      [...mappedIds].some((stateId) => !reachable.has(stateId)) ||
      [...mappedIds].some((stateId) => !canReachFinal.has(stateId))
    ) {
      graphFailures.push(type.key)
    }
  }

  const invalidApprovals = transitions.filter(
    (transition) =>
      transition.requiresApproval &&
      (!Array.isArray(transition.approverRoles) ||
        transition.approverRoles.length === 0 ||
        transition.minApprovals < 1)
  )

  const checks = {
    users: users === 1,
    projects: projects === 1,
    admin: Boolean(admin && admin.globalRole === 'admin' && admin.isActive && passwordValid),
    membership: members === 1,
    teams: teams === 0,
    iterations: iterations === 0,
    issues: issues === 0,
    areas: areas === 1,
    types: typeRows.length === Object.keys(WORKFLOWS).length,
    sections: sections === 20,
    fields: fields === 66,
    fieldMappings: fieldMappings === 66,
    states: stateRows.length === STATES.length,
    stateMappings: stateMappings.length === expectedMappings,
    transitions: transitions.length === expectedTransitions,
    initialStates: initialCounts.size === typeRows.length && [...initialCounts.values()].every((count) => count === 1),
    transitionIntegrity: invalidTransitions.length === 0,
    workflowReachability: graphFailures.length === 0,
    approvalIntegrity: invalidApprovals.length === 0,
    labels: labels === LABELS.length,
    slaPolicies: slaPolicies === SLA_POLICIES.length,
    onboarding: onboardingSteps === 10,
    branding: branding === 1,
  }

  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
  if (failures.length > 0) throw new Error(`Seed validation failed: ${failures.join(', ')}`)

  console.log(JSON.stringify({
    validated: true,
    counts: {
      users,
      projects,
      members,
      teams,
      iterations,
      issues,
      areas,
      types: typeRows.length,
      sections,
      fields,
      fieldMappings,
      states: stateRows.length,
      stateMappings: stateMappings.length,
      transitions: transitions.length,
      labels,
      slaPolicies,
      onboardingSteps,
      branding,
    },
  }, null, 2))
}

async function main() {
  const projectId = await customizeProject()
  await validate(projectId)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
