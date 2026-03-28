import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCondition } from '../../src/lib/domain/automation-rules.ts'
import type { RuleCondition, AutomationEvent } from '../../src/lib/domain/automation-rules.ts'

function issue(overrides: Partial<AutomationEvent['issue']> = {}): AutomationEvent['issue'] {
  return {
    id: 'issue-1',
    status: 'todo',
    priority: 'high',
    assigneeId: 'user-1',
    workItemType: 'bug',
    storyPoints: 5,
    labels: [{ id: 'lbl-1', name: 'frontend' }],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// equals / not_equals
// ---------------------------------------------------------------------------

test('evaluateCondition: equals matches string field', () => {
  const cond: RuleCondition = { field: 'status', operator: 'equals', value: 'todo' }
  assert.equal(evaluateCondition(cond, issue()), true)
})

test('evaluateCondition: equals rejects non-matching value', () => {
  const cond: RuleCondition = { field: 'status', operator: 'equals', value: 'done' }
  assert.equal(evaluateCondition(cond, issue()), false)
})

test('evaluateCondition: not_equals rejects matching value', () => {
  const cond: RuleCondition = { field: 'status', operator: 'not_equals', value: 'todo' }
  assert.equal(evaluateCondition(cond, issue()), false)
})

test('evaluateCondition: not_equals matches non-matching value', () => {
  const cond: RuleCondition = { field: 'status', operator: 'not_equals', value: 'done' }
  assert.equal(evaluateCondition(cond, issue()), true)
})

// ---------------------------------------------------------------------------
// contains / not_contains (string)
// ---------------------------------------------------------------------------

test('evaluateCondition: contains matches substring (case-insensitive)', () => {
  const cond: RuleCondition = { field: 'workItemType', operator: 'contains', value: 'BUG' }
  assert.equal(evaluateCondition(cond, issue()), true)
})

test('evaluateCondition: contains rejects missing substring', () => {
  const cond: RuleCondition = { field: 'workItemType', operator: 'contains', value: 'feature' }
  assert.equal(evaluateCondition(cond, issue()), false)
})

test('evaluateCondition: not_contains rejects present substring', () => {
  const cond: RuleCondition = { field: 'workItemType', operator: 'not_contains', value: 'bug' }
  assert.equal(evaluateCondition(cond, issue()), false)
})

test('evaluateCondition: not_contains matches missing substring', () => {
  const cond: RuleCondition = { field: 'workItemType', operator: 'not_contains', value: 'feature' }
  assert.equal(evaluateCondition(cond, issue()), true)
})

// ---------------------------------------------------------------------------
// contains / not_contains (array of objects with name)
// ---------------------------------------------------------------------------

test('evaluateCondition: contains matches label by name (case-insensitive)', () => {
  const cond: RuleCondition = { field: 'labels', operator: 'contains', value: 'Frontend' }
  assert.equal(evaluateCondition(cond, issue()), true)
})

test('evaluateCondition: contains rejects missing label', () => {
  const cond: RuleCondition = { field: 'labels', operator: 'contains', value: 'backend' }
  assert.equal(evaluateCondition(cond, issue()), false)
})

// ---------------------------------------------------------------------------
// in / not_in
// ---------------------------------------------------------------------------

test('evaluateCondition: in matches field value present in array', () => {
  const cond: RuleCondition = { field: 'priority', operator: 'in', value: ['high', 'highest'] }
  assert.equal(evaluateCondition(cond, issue()), true)
})

test('evaluateCondition: in rejects field value not in array', () => {
  const cond: RuleCondition = { field: 'priority', operator: 'in', value: ['low', 'medium'] }
  assert.equal(evaluateCondition(cond, issue()), false)
})

test('evaluateCondition: not_in matches field value not in array', () => {
  const cond: RuleCondition = { field: 'priority', operator: 'not_in', value: ['low', 'medium'] }
  assert.equal(evaluateCondition(cond, issue()), true)
})

test('evaluateCondition: not_in rejects field value in array', () => {
  const cond: RuleCondition = { field: 'priority', operator: 'not_in', value: ['high', 'highest'] }
  assert.equal(evaluateCondition(cond, issue()), false)
})

// ---------------------------------------------------------------------------
// gt / lt
// ---------------------------------------------------------------------------

test('evaluateCondition: gt matches when field exceeds value', () => {
  const cond: RuleCondition = { field: 'storyPoints', operator: 'gt', value: 3 }
  assert.equal(evaluateCondition(cond, issue()), true)
})

test('evaluateCondition: gt rejects when field equals value', () => {
  const cond: RuleCondition = { field: 'storyPoints', operator: 'gt', value: 5 }
  assert.equal(evaluateCondition(cond, issue()), false)
})

test('evaluateCondition: lt matches when field less than value', () => {
  const cond: RuleCondition = { field: 'storyPoints', operator: 'lt', value: 10 }
  assert.equal(evaluateCondition(cond, issue()), true)
})

test('evaluateCondition: lt rejects when field equals value', () => {
  const cond: RuleCondition = { field: 'storyPoints', operator: 'lt', value: 5 }
  assert.equal(evaluateCondition(cond, issue()), false)
})

test('evaluateCondition: gt returns false for non-numeric field', () => {
  const cond: RuleCondition = { field: 'status', operator: 'gt', value: 3 }
  assert.equal(evaluateCondition(cond, issue()), false)
})

// ---------------------------------------------------------------------------
// is_empty / is_not_empty
// ---------------------------------------------------------------------------

test('evaluateCondition: is_empty matches null field', () => {
  const cond: RuleCondition = { field: 'assigneeId', operator: 'is_empty', value: null }
  assert.equal(evaluateCondition(cond, issue({ assigneeId: null })), true)
})

test('evaluateCondition: is_empty matches undefined field', () => {
  const cond: RuleCondition = { field: 'missing_field', operator: 'is_empty', value: null }
  assert.equal(evaluateCondition(cond, issue()), true)
})

test('evaluateCondition: is_empty matches empty string', () => {
  const cond: RuleCondition = { field: 'status', operator: 'is_empty', value: null }
  assert.equal(evaluateCondition(cond, issue({ status: '' })), true)
})

test('evaluateCondition: is_empty rejects non-empty value', () => {
  const cond: RuleCondition = { field: 'status', operator: 'is_empty', value: null }
  assert.equal(evaluateCondition(cond, issue()), false)
})

test('evaluateCondition: is_not_empty matches filled field', () => {
  const cond: RuleCondition = { field: 'status', operator: 'is_not_empty', value: null }
  assert.equal(evaluateCondition(cond, issue()), true)
})

test('evaluateCondition: is_not_empty rejects null field', () => {
  const cond: RuleCondition = { field: 'assigneeId', operator: 'is_not_empty', value: null }
  assert.equal(evaluateCondition(cond, issue({ assigneeId: null })), false)
})

// ---------------------------------------------------------------------------
// unknown operator
// ---------------------------------------------------------------------------

test('evaluateCondition: unknown operator returns false', () => {
  const cond = { field: 'status', operator: 'invalid_op' as never, value: null }
  assert.equal(evaluateCondition(cond, issue()), false)
})
