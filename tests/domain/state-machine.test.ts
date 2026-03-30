import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStateCategory, statusFromStateCategory } from '../../src/lib/domain/state-categories.ts'

// ---------------------------------------------------------------------------
// normalizeStateCategory
// ---------------------------------------------------------------------------

test('normalizeStateCategory: "Done" returns Completed', () => {
  assert.equal(normalizeStateCategory('Done'), 'Completed')
})

test('normalizeStateCategory: "Completed" returns Completed', () => {
  assert.equal(normalizeStateCategory('Completed'), 'Completed')
})

test('normalizeStateCategory: "Resolved" returns Completed', () => {
  assert.equal(normalizeStateCategory('Resolved'), 'Completed')
})

test('normalizeStateCategory: "In Progress" returns In Progress', () => {
  assert.equal(normalizeStateCategory('In Progress'), 'In Progress')
})

test('normalizeStateCategory: "InProgress" returns In Progress', () => {
  assert.equal(normalizeStateCategory('InProgress'), 'In Progress')
})

test('normalizeStateCategory: "Proposed" returns Proposed', () => {
  assert.equal(normalizeStateCategory('Proposed'), 'Proposed')
})

test('normalizeStateCategory: "New" returns Proposed', () => {
  assert.equal(normalizeStateCategory('New'), 'Proposed')
})

test('normalizeStateCategory: unknown string defaults to Proposed', () => {
  assert.equal(normalizeStateCategory('random'), 'Proposed')
})

test('normalizeStateCategory: empty string defaults to Proposed', () => {
  assert.equal(normalizeStateCategory(''), 'Proposed')
})

// ---------------------------------------------------------------------------
// statusFromStateCategory
// ---------------------------------------------------------------------------

test('statusFromStateCategory: Done category returns done', () => {
  assert.equal(statusFromStateCategory('Done'), 'done')
})

test('statusFromStateCategory: Completed category returns done', () => {
  assert.equal(statusFromStateCategory('Completed'), 'done')
})

test('statusFromStateCategory: Resolved category returns done', () => {
  assert.equal(statusFromStateCategory('Resolved'), 'done')
})

test('statusFromStateCategory: In Progress returns in_progress', () => {
  assert.equal(statusFromStateCategory('In Progress'), 'in_progress')
})

test('statusFromStateCategory: InProgress returns in_progress', () => {
  assert.equal(statusFromStateCategory('InProgress'), 'in_progress')
})

test('statusFromStateCategory: Proposed returns backlog', () => {
  assert.equal(statusFromStateCategory('Proposed'), 'backlog')
})

test('statusFromStateCategory: New returns backlog', () => {
  assert.equal(statusFromStateCategory('New'), 'backlog')
})

test('statusFromStateCategory: unknown returns backlog', () => {
  assert.equal(statusFromStateCategory('anything_else'), 'backlog')
})
