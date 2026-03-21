import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UNASSIGNED_VALUE,
  buildWorkItemPatchPayload,
  canonicalWorkItemRoute,
  getWorkItemTypeDefinition,
  type WorkItemDraft,
} from '../../src/lib/domain/work-item-view.ts'
import type { Issue, WorkItemTypeDefinition } from '../../src/store/app-store.ts'

function createIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'item-1',
    key: 'MAP-1',
    title: 'Original title',
    description: 'Original description',
    workItemType: 'feature',
    status: 'todo',
    priority: 'medium',
    severity: null,
    storyPoints: 5,
    dueDate: null,
    columnOrder: 1000,
    version: 7,
    customFields: { hypothesis: 'Current hypothesis', reason: 'Investigate' },
    project: { id: 'project-1', key: 'MAP', name: 'Map Project', color: '#123456' },
    assignee: { id: 'user-1', name: 'Alice', avatar: null },
    reporter: { id: 'user-2', name: 'Bob', avatar: null },
    iteration: { id: 'iter-1', name: 'Sprint 1', path: 'Release\\Sprint 1', teamId: null },
    area: { id: 'area-1', name: 'Platform', path: 'Platform' },
    stateRecord: { id: 'state-1', name: 'To Do', color: '#aaa', category: 'Proposed', order: 1 },
    labels: [],
    ...overrides,
  }
}

function createDraft(overrides: Partial<WorkItemDraft> = {}): WorkItemDraft {
  return {
    title: 'Original title',
    description: 'Original description',
    workItemType: 'feature',
    status: 'todo',
    priority: 'medium',
    assigneeId: 'user-1',
    iterationId: 'iter-1',
    areaId: 'area-1',
    stateId: 'state-1',
    parentIssueId: UNASSIGNED_VALUE,
    storyPoints: '5',
    estimatedHours: '',
    remainingHours: '',
    completedHours: '',
    customFields: { hypothesis: 'Current hypothesis', reason: 'Investigate' },
    ...overrides,
  }
}

test('canonicalWorkItemRoute always uses the full-screen work item route pattern', () => {
  assert.equal(canonicalWorkItemRoute('abc123'), '/work-items/abc123')
})

test('canonicalWorkItemRoute URL-encodes IDs for stable deep links', () => {
  assert.equal(canonicalWorkItemRoute('abc 123/child'), '/work-items/abc%20123%2Fchild')
})

test('buildWorkItemPatchPayload emits only changed persisted fields', () => {
  const issue = createIssue()
  const draft = createDraft({
    title: 'Updated title',
    stateId: 'state-2',
    assigneeId: UNASSIGNED_VALUE,
    storyPoints: '',
    customFields: { hypothesis: 'Updated hypothesis', reason: 'Investigate' },
  })

  const payload = buildWorkItemPatchPayload(issue, draft)
  assert.deepEqual(payload, {
    title: 'Updated title',
    assigneeId: null,
    stateId: 'state-2',
    storyPoints: null,
    customFields: { hypothesis: 'Updated hypothesis' },
  })
})

test('buildWorkItemPatchPayload does not mutate work item type after creation', () => {
  const issue = createIssue()
  const draft = createDraft({
    workItemType: 'bug',
    customFields: { repro_steps: 'Step 1', expected: 'Expected', actual: 'Actual' },
  })

  const payload = buildWorkItemPatchPayload(issue, draft)
  assert.equal(payload?.workItemType, undefined)
  assert.deepEqual(payload?.customFields, {
    repro_steps: 'Step 1',
    expected: 'Expected',
    actual: 'Actual',
    hypothesis: null,
    reason: null,
  })
})

test('getWorkItemTypeDefinition resolves schema sections by selected type key', () => {
  const definitions = [
    {
      id: 'type-feature',
      key: 'feature',
      name: 'Feature',
      description: null,
      icon: null,
      color: '#111111',
      hierarchyLevel: 2,
      isSystem: false,
      isEnabled: true,
      order: 10,
      sections: [{ id: 'sec-hypothesis', key: 'hypothesis', title: 'Hypothesis', sectionType: 'fields', isCollapsible: false, order: 10, fields: [] }],
      fields: [],
    },
    {
      id: 'type-bug',
      key: 'bug',
      name: 'Bug',
      description: null,
      icon: null,
      color: '#222222',
      hierarchyLevel: 4,
      isSystem: false,
      isEnabled: true,
      order: 20,
      sections: [{ id: 'sec-repro', key: 'repro', title: 'Repro Steps', sectionType: 'fields', isCollapsible: false, order: 10, fields: [] }],
      fields: [],
    },
  ] as WorkItemTypeDefinition[]

  const resolved = getWorkItemTypeDefinition(definitions, 'bug')
  assert.equal(resolved?.key, 'bug')
  assert.equal(resolved?.sections[0]?.title, 'Repro Steps')
})

test('buildWorkItemPatchPayload returns null when no persisted value changed', () => {
  const issue = createIssue({
    parentIssueId: null,
    parentIssue: null,
  })
  const draft = createDraft({
    parentIssueId: UNASSIGNED_VALUE,
  })

  assert.equal(buildWorkItemPatchPayload(issue, draft), null)
})
