import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWorkItemHierarchy,
  flattenWorkItemHierarchy,
} from '../../src/lib/domain/work-item-hierarchy.ts'

const items = [
  { id: 'epic-1', parentIssueId: null, key: 'EPIC-1' },
  { id: 'story-1', parentIssueId: 'epic-1', key: 'STORY-1' },
  { id: 'task-1', parentIssueId: 'story-1', key: 'TASK-1' },
  { id: 'story-2', parentIssueId: 'epic-1', key: 'STORY-2' },
  { id: 'bug-1', parentIssueId: null, key: 'BUG-1' },
]

test('buildWorkItemHierarchy preserves parent child structure from persisted relationships', () => {
  const tree = buildWorkItemHierarchy(items)

  assert.equal(tree.length, 2)
  assert.equal(tree[0].id, 'epic-1')
  assert.equal(tree[0].children.length, 2)
  assert.equal(tree[0].children[0].children[0].id, 'task-1')
})

test('flattenWorkItemHierarchy returns only expanded descendants', () => {
  const tree = buildWorkItemHierarchy(items)

  const collapsed = flattenWorkItemHierarchy(tree, new Set<string>())
  assert.deepEqual(collapsed.map((row) => row.item.id), ['epic-1', 'bug-1'])

  const expanded = flattenWorkItemHierarchy(tree, new Set<string>(['epic-1', 'story-1']))
  assert.deepEqual(expanded.map((row) => row.item.id), [
    'epic-1',
    'story-1',
    'task-1',
    'story-2',
    'bug-1',
  ])
  assert.deepEqual(expanded.map((row) => row.depth), [0, 1, 2, 1, 0])
})
