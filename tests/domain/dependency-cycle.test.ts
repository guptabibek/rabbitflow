import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findCycleCreatedByEdge,
  findCyclicNodeIds,
  toDirectedDependency,
} from '../../src/lib/domain/dependency-cycle.ts'

test('blocked_by relations normalize to blocker then blocked', () => {
  assert.deepEqual(toDirectedDependency({ sourceIssueId: 'B', targetIssueId: 'A', relationType: 'blocked_by' }), {
    blockerId: 'A',
    blockedId: 'B',
  })
})

test('a proposed dependency reports the complete cycle path', () => {
  const relations = [
    { sourceIssueId: 'A', targetIssueId: 'B', relationType: 'blocks' },
    { sourceIssueId: 'B', targetIssueId: 'C', relationType: 'blocks' },
  ]
  assert.deepEqual(findCycleCreatedByEdge(relations, 'C', 'A'), ['C', 'A', 'B', 'C'])
  assert.equal(findCycleCreatedByEdge(relations, 'A', 'C'), null)
})

test('cyclic nodes are surfaced from legacy graph data', () => {
  const relations = [
    { sourceIssueId: 'A', targetIssueId: 'B', relationType: 'blocks' },
    { sourceIssueId: 'B', targetIssueId: 'C', relationType: 'blocks' },
    { sourceIssueId: 'C', targetIssueId: 'A', relationType: 'blocks' },
  ]
  assert.deepEqual([...findCyclicNodeIds(relations)].sort(), ['A', 'B', 'C'])
})
