import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTree } from '../../src/lib/domain/tree-builder.ts'

// ---------------------------------------------------------------------------
// buildTree
// ---------------------------------------------------------------------------

test('buildTree: builds flat list into nested tree', () => {
  const items = [
    { id: '1', parentId: null, title: 'Root 1' },
    { id: '2', parentId: null, title: 'Root 2' },
    { id: '3', parentId: '1', title: 'Child 1.1' },
    { id: '4', parentId: '1', title: 'Child 1.2' },
    { id: '5', parentId: '3', title: 'Grandchild 1.1.1' },
  ]

  const tree = buildTree(items, null)
  assert.equal(tree.length, 2) // Two root nodes

  const root1 = tree.find((n) => n.id === '1')!
  assert.ok(root1)
  assert.equal((root1.children as unknown[]).length, 2)

  const child11 = (root1.children as Array<Record<string, unknown>>).find((n) => n.id === '3')!
  assert.ok(child11)
  assert.equal((child11.children as unknown[]).length, 1)

  const grandchild = (child11.children as Array<Record<string, unknown>>)[0]
  assert.equal(grandchild.id, '5')
  assert.equal((grandchild.children as unknown[]).length, 0)

  const root2 = tree.find((n) => n.id === '2')!
  assert.equal((root2.children as unknown[]).length, 0)
})

test('buildTree: returns empty array for empty input', () => {
  const tree = buildTree([], null)
  assert.deepEqual(tree, [])
})

test('buildTree: handles single root node', () => {
  const items = [{ id: '1', parentId: null, title: 'Root' }]
  const tree = buildTree(items, null)
  assert.equal(tree.length, 1)
  assert.equal(tree[0].title, 'Root')
  assert.deepEqual(tree[0].children, [])
})

test('buildTree: items with non-matching parentId are excluded from root', () => {
  const items = [
    { id: '1', parentId: null, title: 'Root' },
    { id: '2', parentId: 'nonexistent', title: 'Orphan' },
  ]
  const tree = buildTree(items, null)
  // Orphan has parentId 'nonexistent', not null, so it's not at root
  assert.equal(tree.length, 1)
  assert.equal(tree[0].id, '1')
})

test('buildTree: can build subtree starting from a specific parentId', () => {
  const items = [
    { id: '1', parentId: null, title: 'Root' },
    { id: '2', parentId: '1', title: 'Child' },
    { id: '3', parentId: '2', title: 'Grandchild' },
  ]
  const subtree = buildTree(items, '1')
  assert.equal(subtree.length, 1)
  assert.equal(subtree[0].id, '2')
  assert.equal((subtree[0].children as unknown[]).length, 1)
})

test('buildTree: preserves extra properties on items', () => {
  const items = [
    { id: '1', parentId: null, title: 'Root', sortOrder: 1, status: 'published' },
  ]
  const tree = buildTree(items, null)
  assert.equal(tree[0].sortOrder, 1)
  assert.equal(tree[0].status, 'published')
})

test('buildTree: deeply nested hierarchy (3+ levels)', () => {
  const items = [
    { id: '1', parentId: null, title: 'L0' },
    { id: '2', parentId: '1', title: 'L1' },
    { id: '3', parentId: '2', title: 'L2' },
    { id: '4', parentId: '3', title: 'L3' },
  ]
  const tree = buildTree(items, null)
  const l0 = tree[0]
  const l1 = (l0.children as Array<Record<string, unknown>>)[0]
  const l2 = (l1.children as Array<Record<string, unknown>>)[0]
  const l3 = (l2.children as Array<Record<string, unknown>>)[0]
  assert.equal(l3.title, 'L3')
  assert.deepEqual(l3.children, [])
})
