import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStateCategory, statusFromStateCategory } from '../../src/lib/domain/state-categories.ts'

// ---------------------------------------------------------------------------
// normalizeStateCategory
// ---------------------------------------------------------------------------

test('normalizeStateCategory: "Done" returns Done', () => {
  assert.equal(normalizeStateCategory('Done'), 'Done')
})

test('normalizeStateCategory: "Completed" returns Done', () => {
  assert.equal(normalizeStateCategory('Completed'), 'Done')
})

test('normalizeStateCategory: "Resolved" returns Done', () => {
  assert.equal(normalizeStateCategory('Resolved'), 'Done')
})

test('normalizeStateCategory: "In Progress" returns In Progress', () => {
  assert.equal(normalizeStateCategory('In Progress'), 'In Progress')
})

test('normalizeStateCategory: "InProgress" returns In Progress', () => {
  assert.equal(normalizeStateCategory('InProgress'), 'In Progress')
})

test('normalizeStateCategory: "New" returns New', () => {
  assert.equal(normalizeStateCategory('New'), 'New')
})

test('normalizeStateCategory: unknown string defaults to New', () => {
  assert.equal(normalizeStateCategory('random'), 'New')
})

test('normalizeStateCategory: empty string defaults to New', () => {
  assert.equal(normalizeStateCategory(''), 'New')
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

test('statusFromStateCategory: New returns backlog', () => {
  assert.equal(statusFromStateCategory('New'), 'backlog')
})

test('statusFromStateCategory: unknown returns backlog', () => {
  assert.equal(statusFromStateCategory('anything_else'), 'backlog')
})
