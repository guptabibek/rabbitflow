import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertTransition,
  canTransition,
  getAllowedTransitions,
} from '../../src/lib/domain/workflow.ts'

test('canTransition allows only configured workflow changes', () => {
  assert.equal(canTransition('backlog', 'todo'), true)
  assert.equal(canTransition('todo', 'done'), false)
  assert.equal(canTransition('done', 'in_review'), true)
})

test('assertTransition throws on invalid transitions', () => {
  assert.throws(() => assertTransition('todo', 'done'), /Invalid transition/)
})

test('getAllowedTransitions exposes the valid next states', () => {
  assert.deepEqual(getAllowedTransitions('in_progress'), ['in_review', 'todo', 'cancelled'])
})
