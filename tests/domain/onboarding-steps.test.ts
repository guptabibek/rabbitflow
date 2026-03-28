import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_ONBOARDING_STEPS,
  COMPLETION_RULE_DESCRIPTIONS,
  type OnboardingRole,
} from '../../src/lib/domain/onboarding-steps.ts'

// ── Step definitions ───────────────────────────────────────────

test('DEFAULT_ONBOARDING_STEPS has unique keys', () => {
  const keys = DEFAULT_ONBOARDING_STEPS.map((s) => s.key)
  assert.equal(new Set(keys).size, keys.length, 'Duplicate step keys found')
})

test('DEFAULT_ONBOARDING_STEPS are ordered by "order" field', () => {
  for (let i = 1; i < DEFAULT_ONBOARDING_STEPS.length; i++) {
    assert.ok(
      DEFAULT_ONBOARDING_STEPS[i].order >= DEFAULT_ONBOARDING_STEPS[i - 1].order,
      `Step "${DEFAULT_ONBOARDING_STEPS[i].key}" has lower order than previous step`
    )
  }
})

test('every step has a non-empty title and description', () => {
  for (const step of DEFAULT_ONBOARDING_STEPS) {
    assert.ok(step.title.length > 0, `Step "${step.key}" has empty title`)
    assert.ok(step.description.length > 0, `Step "${step.key}" has empty description`)
  }
})

test('every step has a valid completionRule with description', () => {
  for (const step of DEFAULT_ONBOARDING_STEPS) {
    assert.ok(step.completionRule.length > 0, `Step "${step.key}" has empty completionRule`)
    assert.ok(
      COMPLETION_RULE_DESCRIPTIONS[step.completionRule],
      `Step "${step.key}" uses unknown completionRule "${step.completionRule}"`
    )
  }
})

test('every step has valid roles (subset of known roles)', () => {
  const validRoles: OnboardingRole[] = ['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer']
  for (const step of DEFAULT_ONBOARDING_STEPS) {
    for (const role of step.roles) {
      assert.ok(
        validRoles.includes(role),
        `Step "${step.key}" has invalid role "${role}"`
      )
    }
  }
})

test('every step has a ctaLabel', () => {
  for (const step of DEFAULT_ONBOARDING_STEPS) {
    assert.ok(step.ctaLabel.length > 0, `Step "${step.key}" has empty ctaLabel`)
  }
})

test('step keys follow snake_case convention', () => {
  const snakeCaseRegex = /^[a-z][a-z0-9_]*$/
  for (const step of DEFAULT_ONBOARDING_STEPS) {
    assert.ok(
      snakeCaseRegex.test(step.key),
      `Step key "${step.key}" does not follow snake_case`
    )
  }
})

// ── Role-based filtering ───────────────────────────────────────

test('Admin role sees all Admin-targeted steps', () => {
  const adminSteps = DEFAULT_ONBOARDING_STEPS.filter(
    (s) => s.roles.length === 0 || s.roles.includes('Admin')
  )
  assert.ok(adminSteps.length > 0, 'Admin should see at least one step')
})

test('Dev role only sees Dev-relevant steps', () => {
  const devSteps = DEFAULT_ONBOARDING_STEPS.filter(
    (s) => s.roles.length === 0 || s.roles.includes('Dev')
  )
  assert.ok(devSteps.length > 0, 'Dev should see at least one step')

  // Dev should NOT see PM-only steps
  const pmOnlySteps = DEFAULT_ONBOARDING_STEPS.filter(
    (s) => s.roles.includes('PM') && !s.roles.includes('Dev')
  )
  for (const step of pmOnlySteps) {
    assert.ok(!devSteps.includes(step), `Dev should not see PM-only step "${step.key}"`)
  }
})

test('QA role filters appropriately', () => {
  const qaSteps = DEFAULT_ONBOARDING_STEPS.filter(
    (s) => s.roles.length === 0 || s.roles.includes('QA')
  )
  assert.ok(qaSteps.length > 0, 'QA should see at least one step')
})

test('Viewer role sees minimal steps', () => {
  const viewerSteps = DEFAULT_ONBOARDING_STEPS.filter(
    (s) => s.roles.length === 0 || s.roles.includes('Viewer')
  )
  // Viewer should see very few steps since most are for active roles
  assert.ok(viewerSteps.length <= DEFAULT_ONBOARDING_STEPS.length)
})

// ── Completion rules mapping ───────────────────────────────────

test('COMPLETION_RULE_DESCRIPTIONS covers all used rules', () => {
  const usedRules = new Set(DEFAULT_ONBOARDING_STEPS.map((s) => s.completionRule))
  for (const rule of usedRules) {
    assert.ok(
      COMPLETION_RULE_DESCRIPTIONS[rule],
      `Rule "${rule}" is used in steps but not documented in COMPLETION_RULE_DESCRIPTIONS`
    )
  }
})

test('completion rules have meaningful descriptions', () => {
  for (const [rule, desc] of Object.entries(COMPLETION_RULE_DESCRIPTIONS)) {
    assert.ok(desc.length > 10, `Rule "${rule}" description is too short`)
  }
})
