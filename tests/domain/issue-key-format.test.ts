import test from 'node:test'
import assert from 'node:assert/strict'
import {
  compareIssueKeys,
  extractProjectIssueNumber,
  formatProjectIssueKey,
} from '../../src/lib/domain/issue-key-format.ts'

/**
 * Regression tests for UX-009: List View sorted issue keys as strings, producing
 * RABBIT-1, RABBIT-10, RABBIT-11, RABBIT-2 … which makes the key column useless
 * past nine work items.
 */

test('UX-009: issue keys sort numerically, not lexicographically', () => {
  const keys = ['RABBIT-1', 'RABBIT-10', 'RABBIT-11', 'RABBIT-2', 'RABBIT-3', 'RABBIT-20']
  const sorted = [...keys].sort(compareIssueKeys)

  assert.deepEqual(sorted, [
    'RABBIT-1',
    'RABBIT-2',
    'RABBIT-3',
    'RABBIT-10',
    'RABBIT-11',
    'RABBIT-20',
  ])
})

test('UX-009: keys from different projects group by prefix first', () => {
  const sorted = ['ZULU-2', 'ALPHA-10', 'ALPHA-2', 'ZULU-1'].sort(compareIssueKeys)
  assert.deepEqual(sorted, ['ALPHA-2', 'ALPHA-10', 'ZULU-1', 'ZULU-2'])
})

test('UX-009: large numbers order correctly', () => {
  const sorted = ['P-9', 'P-100', 'P-1000', 'P-99'].sort(compareIssueKeys)
  assert.deepEqual(sorted, ['P-9', 'P-99', 'P-100', 'P-1000'])
})

test('UX-009: keys with hyphenated project prefixes split on the last hyphen', () => {
  const sorted = ['MY-PROJ-10', 'MY-PROJ-2'].sort(compareIssueKeys)
  assert.deepEqual(sorted, ['MY-PROJ-2', 'MY-PROJ-10'])
})

test('UX-009: non-numeric keys fall back to stable string ordering', () => {
  const sorted = ['NOPE', 'ABC', 'RABBIT-1'].sort(compareIssueKeys)
  assert.deepEqual(sorted, ['ABC', 'NOPE', 'RABBIT-1'])
})

test('UX-009: comparator is symmetric and reflexive', () => {
  assert.equal(compareIssueKeys('RABBIT-5', 'RABBIT-5'), 0)
  assert.ok(compareIssueKeys('RABBIT-2', 'RABBIT-10') < 0)
  assert.ok(compareIssueKeys('RABBIT-10', 'RABBIT-2') > 0)
})

test('formatProjectIssueKey and extractProjectIssueNumber round-trip', () => {
  const key = formatProjectIssueKey('RABBIT', 42)
  assert.equal(key, 'RABBIT-42')
  assert.equal(extractProjectIssueNumber(key, 'RABBIT'), 42)
  assert.equal(extractProjectIssueNumber(key, 'OTHER'), null)
})
