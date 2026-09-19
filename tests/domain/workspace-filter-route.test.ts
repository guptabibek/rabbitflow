import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseWorkspaceFilterRoute,
  workspaceFilterRouteSignature,
  writeWorkspaceFilterRoute,
} from '../../src/lib/domain/workspace-filter-route.ts'

test('workspace filters round-trip through readable query parameters', () => {
  const params = writeWorkspaceFilterRoute(
    '?unrelated=kept',
    {
      search: 'login failure',
      assigneeId: 'user-1',
      priority: 'high',
      iterationId: 'sprint-4',
      areaId: 'area-2',
      labelIds: ['label-2', 'label-1'],
    },
    'bug'
  )

  assert.equal(params.get('unrelated'), 'kept')
  assert.deepEqual(parseWorkspaceFilterRoute(params), {
    search: 'login failure',
    workItemType: 'bug',
    assigneeId: 'user-1',
    priority: 'high',
    iterationId: 'sprint-4',
    areaId: 'area-2',
    labelIds: ['label-2', 'label-1'],
  })
})

test('workspace filter parsing rejects invalid priority and bounds repeated values', () => {
  const labels = Array.from({ length: 25 }, (_, index) => `label-${index}`).join(',')
  const parsed = parseWorkspaceFilterRoute(`?priority=urgent&labelIds=${labels},label-1`)

  assert.equal(parsed.priority, null)
  assert.equal(parsed.labelIds.length, 20)
  assert.equal(new Set(parsed.labelIds).size, 20)
})

test('workspace filter serialization clears defaults without removing other route state', () => {
  const params = writeWorkspaceFilterRoute(
    '?search=old&workItemType=bug&labelIds=one,two&panel=activity',
    { search: '', labelIds: [] },
    'all'
  )

  assert.equal(params.toString(), 'panel=activity')
})

test('workspace filter signature treats label order as equivalent', () => {
  const first = parseWorkspaceFilterRoute('?labelIds=b,a')
  const second = parseWorkspaceFilterRoute('?labelIds=a,b')
  assert.equal(workspaceFilterRouteSignature(first), workspaceFilterRouteSignature(second))
})
