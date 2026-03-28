/**
 * Tests for onboarding evaluation logic.
 *
 * These test the rule evaluation and step filtering logic without
 * requiring a real database. The DB-dependent integration is tested
 * via the API routes in a running environment.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_ONBOARDING_STEPS,
  COMPLETION_RULE_DESCRIPTIONS,
} from '../../src/lib/domain/onboarding-steps.ts'

// ── Simulate the rule resolvers from the engine ────────────────
// We replicate the resolver map here to unit-test without the DB

type EvalContext = {
  projectId: string
  userId: string
  memberCount: number
  issueCount: number
  assignedIssueCount: number
  completedIssueCount: number
  iterationCount: number
  teamCount: number
  labelCount: number
  eventSteps: string[]
}

type RuleResolver = (ctx: EvalContext) => boolean

const RULE_RESOLVERS: Record<string, RuleResolver> = {
  has_project: () => true,
  has_team_member: (ctx) => ctx.memberCount > 1,
  has_issue: (ctx) => ctx.issueCount > 0,
  viewed_board: (ctx) => ctx.eventSteps.includes('viewed_board'),
  has_sprint: (ctx) => ctx.iterationCount > 0,
  has_assigned_issue: (ctx) => ctx.assignedIssueCount > 0,
  has_team: (ctx) => ctx.teamCount > 0,
  has_label: (ctx) => ctx.labelCount > 0,
  has_completed_issue: (ctx) => ctx.completedIssueCount > 0,
  viewed_reports: (ctx) => ctx.eventSteps.includes('viewed_reports'),
}

function evaluateRule(rule: string, ctx: EvalContext): boolean {
  const resolver = RULE_RESOLVERS[rule]
  if (!resolver) return false
  return resolver(ctx)
}

function makeCtx(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    projectId: 'proj-1',
    userId: 'user-1',
    memberCount: 1,
    issueCount: 0,
    assignedIssueCount: 0,
    completedIssueCount: 0,
    iterationCount: 0,
    teamCount: 0,
    labelCount: 0,
    eventSteps: [],
    ...overrides,
  }
}

// ── Rule resolver tests ────────────────────────────────────────

test('has_project always returns true in project context', () => {
  assert.equal(evaluateRule('has_project', makeCtx()), true)
})

test('has_team_member requires memberCount > 1', () => {
  assert.equal(evaluateRule('has_team_member', makeCtx({ memberCount: 1 })), false)
  assert.equal(evaluateRule('has_team_member', makeCtx({ memberCount: 2 })), true)
  assert.equal(evaluateRule('has_team_member', makeCtx({ memberCount: 50 })), true)
})

test('has_issue requires issueCount > 0', () => {
  assert.equal(evaluateRule('has_issue', makeCtx({ issueCount: 0 })), false)
  assert.equal(evaluateRule('has_issue', makeCtx({ issueCount: 1 })), true)
})

test('viewed_board requires event in completedSteps', () => {
  assert.equal(evaluateRule('viewed_board', makeCtx()), false)
  assert.equal(evaluateRule('viewed_board', makeCtx({ eventSteps: ['viewed_board'] })), true)
  assert.equal(evaluateRule('viewed_board', makeCtx({ eventSteps: ['viewed_reports'] })), false)
})

test('has_sprint requires iterationCount > 0', () => {
  assert.equal(evaluateRule('has_sprint', makeCtx({ iterationCount: 0 })), false)
  assert.equal(evaluateRule('has_sprint', makeCtx({ iterationCount: 1 })), true)
})

test('has_assigned_issue requires assignedIssueCount > 0', () => {
  assert.equal(evaluateRule('has_assigned_issue', makeCtx({ assignedIssueCount: 0 })), false)
  assert.equal(evaluateRule('has_assigned_issue', makeCtx({ assignedIssueCount: 3 })), true)
})

test('has_team requires teamCount > 0', () => {
  assert.equal(evaluateRule('has_team', makeCtx({ teamCount: 0 })), false)
  assert.equal(evaluateRule('has_team', makeCtx({ teamCount: 1 })), true)
})

test('has_label requires labelCount > 0', () => {
  assert.equal(evaluateRule('has_label', makeCtx({ labelCount: 0 })), false)
  assert.equal(evaluateRule('has_label', makeCtx({ labelCount: 5 })), true)
})

test('has_completed_issue requires completedIssueCount > 0', () => {
  assert.equal(evaluateRule('has_completed_issue', makeCtx({ completedIssueCount: 0 })), false)
  assert.equal(evaluateRule('has_completed_issue', makeCtx({ completedIssueCount: 1 })), true)
})

test('viewed_reports requires event', () => {
  assert.equal(evaluateRule('viewed_reports', makeCtx()), false)
  assert.equal(evaluateRule('viewed_reports', makeCtx({ eventSteps: ['viewed_reports'] })), true)
})

test('unknown rule returns false', () => {
  assert.equal(evaluateRule('nonexistent_rule', makeCtx()), false)
})

// ── Full evaluation simulation ─────────────────────────────────

test('fresh user with empty project has minimal completions', () => {
  const ctx = makeCtx()
  const results = DEFAULT_ONBOARDING_STEPS
    .filter((s) => s.roles.includes('Admin'))
    .map((step) => ({
      key: step.key,
      isCompleted: evaluateRule(step.completionRule, ctx),
    }))

  // Only has_project should be true (since we're in a project context)
  const completed = results.filter((r) => r.isCompleted)
  assert.equal(completed.length, 1)
  assert.equal(completed[0].key, 'create_project')
})

test('user with some data shows correct partial completion', () => {
  const ctx = makeCtx({
    memberCount: 3,
    issueCount: 5,
    assignedIssueCount: 2,
    completedIssueCount: 0,
    iterationCount: 1,
    teamCount: 1,
    labelCount: 2,
    eventSteps: ['viewed_board'],
  })

  const results = DEFAULT_ONBOARDING_STEPS.map((step) => ({
    key: step.key,
    isCompleted: evaluateRule(step.completionRule, ctx),
  }))

  const completedKeys = results.filter((r) => r.isCompleted).map((r) => r.key)
  assert.ok(completedKeys.includes('create_project'))
  assert.ok(completedKeys.includes('invite_member'))
  assert.ok(completedKeys.includes('create_issue'))
  assert.ok(completedKeys.includes('setup_board'))
  assert.ok(completedKeys.includes('create_sprint'))
  assert.ok(completedKeys.includes('assign_issue'))
  assert.ok(completedKeys.includes('setup_team'))
  assert.ok(completedKeys.includes('create_label'))
  assert.ok(!completedKeys.includes('complete_issue')) // 0 completed issues
  assert.ok(!completedKeys.includes('explore_reports')) // not viewed
})

test('fully completed user has all steps done', () => {
  const ctx = makeCtx({
    memberCount: 5,
    issueCount: 20,
    assignedIssueCount: 10,
    completedIssueCount: 3,
    iterationCount: 2,
    teamCount: 2,
    labelCount: 5,
    eventSteps: ['viewed_board', 'viewed_reports'],
  })

  const results = DEFAULT_ONBOARDING_STEPS.map((step) => ({
    key: step.key,
    isCompleted: evaluateRule(step.completionRule, ctx),
  }))

  const allCompleted = results.every((r) => r.isCompleted)
  assert.ok(allCompleted, 'All steps should be completed')
})

// ── Progress calculation ───────────────────────────────────────

test('progress percentage calculates correctly', () => {
  const steps = [
    { isCompleted: true },
    { isCompleted: true },
    { isCompleted: false },
    { isCompleted: false },
    { isCompleted: false },
  ]

  const completedCount = steps.filter((s) => s.isCompleted).length
  const totalCount = steps.length
  const progressPercent = Math.round((completedCount / totalCount) * 100)
  assert.equal(progressPercent, 40)
})

test('progress is 100% when all steps completed', () => {
  const steps = [{ isCompleted: true }, { isCompleted: true }, { isCompleted: true }]
  const completedCount = steps.filter((s) => s.isCompleted).length
  const totalCount = steps.length
  const progressPercent = Math.round((completedCount / totalCount) * 100)
  assert.equal(progressPercent, 100)
})

test('progress is 0% with no completed steps', () => {
  const steps = [{ isCompleted: false }, { isCompleted: false }]
  const completedCount = steps.filter((s) => s.isCompleted).length
  const totalCount = steps.length
  const progressPercent = Math.round((completedCount / totalCount) * 100)
  assert.equal(progressPercent, 0)
})

// ── Current step determination ─────────────────────────────────

test('current step is the first non-completed, non-dismissed step', () => {
  type Step = { key: string; isCompleted: boolean; isDismissed: boolean }
  const steps: Step[] = [
    { key: 'a', isCompleted: true, isDismissed: false },
    { key: 'b', isCompleted: false, isDismissed: true },
    { key: 'c', isCompleted: false, isDismissed: false },
    { key: 'd', isCompleted: false, isDismissed: false },
  ]

  const current = steps.find((s) => !s.isCompleted && !s.isDismissed)?.key ?? null
  assert.equal(current, 'c')
})

test('current step is null when all steps completed', () => {
  type Step = { key: string; isCompleted: boolean; isDismissed: boolean }
  const steps: Step[] = [
    { key: 'a', isCompleted: true, isDismissed: false },
    { key: 'b', isCompleted: true, isDismissed: false },
  ]

  const current = steps.find((s) => !s.isCompleted && !s.isDismissed)?.key ?? null
  assert.equal(current, null)
})

test('current step is null when remaining steps are all dismissed', () => {
  type Step = { key: string; isCompleted: boolean; isDismissed: boolean }
  const steps: Step[] = [
    { key: 'a', isCompleted: true, isDismissed: false },
    { key: 'b', isCompleted: false, isDismissed: true },
    { key: 'c', isCompleted: false, isDismissed: true },
  ]

  const current = steps.find((s) => !s.isCompleted && !s.isDismissed)?.key ?? null
  assert.equal(current, null)
})

// ── Edge cases ─────────────────────────────────────────────────

test('event-based completion persists after data reverts', () => {
  // If a user viewed the board once, that event stays even if they haven't
  // done other things. This tests that eventSteps is separate from data.
  const ctx = makeCtx({ eventSteps: ['viewed_board'] })
  assert.equal(evaluateRule('viewed_board', ctx), true)
  assert.equal(evaluateRule('has_issue', ctx), false) // data-based still false
})

test('multiple event steps can coexist', () => {
  const ctx = makeCtx({ eventSteps: ['viewed_board', 'viewed_reports'] })
  assert.equal(evaluateRule('viewed_board', ctx), true)
  assert.equal(evaluateRule('viewed_reports', ctx), true)
})

test('all completion rules in RULE_RESOLVERS map are covered by descriptions', () => {
  for (const key of Object.keys(RULE_RESOLVERS)) {
    assert.ok(
      COMPLETION_RULE_DESCRIPTIONS[key],
      `Rule "${key}" in resolvers but not in descriptions`
    )
  }
})

test('all described rules have resolvers', () => {
  for (const key of Object.keys(COMPLETION_RULE_DESCRIPTIONS)) {
    assert.ok(RULE_RESOLVERS[key], `Rule "${key}" described but has no resolver`)
  }
})
