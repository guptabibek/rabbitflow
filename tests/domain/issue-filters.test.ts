import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterIssues,
  hasActiveFilters,
  matchesIssueFilters,
  toIssueQueryParams,
  type FilterableIssue,
} from '../../src/lib/domain/issue-filters.ts'

/**
 * The shared work-item filter predicate (FE-006).
 *
 * This logic was duplicated across List View and the Kanban board, and the
 * copies had drifted: the board honoured `filters.type` and searched
 * descriptions, the list did neither. Applying a filter and switching view gave
 * different results, with nothing to say which was correct.
 */

const issue = (overrides: Partial<FilterableIssue> = {}): FilterableIssue => ({
  key: 'RABBIT-1',
  title: 'Fix the login redirect',
  description: 'Users land on the dashboard instead of the requested page.',
  priority: 'medium',
  workItemType: 'task',
  assignee: { id: 'user-1' },
  iteration: { id: 'sprint-1' },
  area: { id: 'area-1' },
  labels: [{ label: { id: 'label-1' } }, { label: { id: 'label-2' } }],
  ...overrides,
})

test('an empty filter matches everything', () => {
  assert.equal(matchesIssueFilters(issue(), {}), true)
})

test('assignee, priority, iteration and area each narrow independently', () => {
  const item = issue()

  assert.equal(matchesIssueFilters(item, { assigneeId: 'user-1' }), true)
  assert.equal(matchesIssueFilters(item, { assigneeId: 'user-2' }), false)

  assert.equal(matchesIssueFilters(item, { priority: 'medium' }), true)
  assert.equal(matchesIssueFilters(item, { priority: 'high' }), false)

  assert.equal(matchesIssueFilters(item, { iterationId: 'sprint-1' }), true)
  assert.equal(matchesIssueFilters(item, { iterationId: 'sprint-2' }), false)

  assert.equal(matchesIssueFilters(item, { areaId: 'area-1' }), true)
  assert.equal(matchesIssueFilters(item, { areaId: 'area-2' }), false)
})

test('an unassigned work item does not match an assignee filter', () => {
  assert.equal(matchesIssueFilters(issue({ assignee: null }), { assigneeId: 'user-1' }), false)
})

test('FE-006: filters.type is honoured — the list view used to ignore it', () => {
  const item = issue({ workItemType: 'bug' })

  assert.equal(matchesIssueFilters(item, { type: 'bug' }), true)
  assert.equal(matchesIssueFilters(item, { type: 'task' }), false)
})

test('the type tab and the type filter both apply', () => {
  const item = issue({ workItemType: 'bug' })

  assert.equal(matchesIssueFilters(item, {}, { workItemTypeTab: 'bug' }), true)
  assert.equal(matchesIssueFilters(item, {}, { workItemTypeTab: 'task' }), false)
  // "all" is the unfiltered tab.
  assert.equal(matchesIssueFilters(item, {}, { workItemTypeTab: 'all' }), true)

  // Conflicting tab and filter exclude everything, which is the honest answer.
  assert.equal(matchesIssueFilters(item, { type: 'task' }, { workItemTypeTab: 'bug' }), false)
})

test('label filtering requires every selected label, not any', () => {
  const item = issue()

  assert.equal(matchesIssueFilters(item, { labelIds: ['label-1'] }), true)
  assert.equal(matchesIssueFilters(item, { labelIds: ['label-1', 'label-2'] }), true)
  // label-3 is absent, so the AND fails even though label-1 matches.
  assert.equal(matchesIssueFilters(item, { labelIds: ['label-1', 'label-3'] }), false)
})

test('a work item with no labels fails any label filter', () => {
  assert.equal(matchesIssueFilters(issue({ labels: [] }), { labelIds: ['label-1'] }), false)
  assert.equal(matchesIssueFilters(issue({ labels: undefined }), { labelIds: ['label-1'] }), false)
})

test('search matches title and key case-insensitively', () => {
  const item = issue()

  assert.equal(matchesIssueFilters(item, { search: 'LOGIN' }), true)
  assert.equal(matchesIssueFilters(item, { search: 'rabbit-1' }), true)
  assert.equal(matchesIssueFilters(item, { search: 'nonexistent' }), false)
})

test('FE-006: search covers descriptions by default — the list view used not to', () => {
  const item = issue({ title: 'Unrelated', description: 'mentions the redirect bug' })

  assert.equal(matchesIssueFilters(item, { search: 'redirect' }), true)
  // Opt out where a view deliberately searches only the identifier and title.
  assert.equal(
    matchesIssueFilters(item, { search: 'redirect' }, { searchDescription: false }),
    false
  )
})

test('a whitespace-only search is treated as no search', () => {
  assert.equal(matchesIssueFilters(issue(), { search: '   ' }), true)
})

test('a missing description does not break description search', () => {
  // Title and key deliberately exclude the term, so only the description could
  // have matched.
  const item = issue({ key: 'A-1', title: 'Unrelated', description: null })
  assert.equal(matchesIssueFilters(item, { search: 'redirect' }), false)
})

test('criteria combine as AND', () => {
  const item = issue()

  assert.equal(matchesIssueFilters(item, { assigneeId: 'user-1', priority: 'medium' }), true)
  assert.equal(matchesIssueFilters(item, { assigneeId: 'user-1', priority: 'high' }), false)
})

test('filterIssues narrows a collection', () => {
  const items = [
    issue({ key: 'A-1', priority: 'high' }),
    issue({ key: 'A-2', priority: 'low' }),
    issue({ key: 'A-3', priority: 'high' }),
  ]

  const result = filterIssues(items, { priority: 'high' })
  assert.deepEqual(result.map((i) => i.key), ['A-1', 'A-3'])
})

test('hasActiveFilters reflects whether anything is applied', () => {
  assert.equal(hasActiveFilters({}), false)
  assert.equal(hasActiveFilters({ search: '  ' }), false)
  assert.equal(hasActiveFilters({}, { workItemTypeTab: 'all' }), false)

  assert.equal(hasActiveFilters({ priority: 'high' }), true)
  assert.equal(hasActiveFilters({ labelIds: ['x'] }), true)
  assert.equal(hasActiveFilters({ search: 'text' }), true)
  assert.equal(hasActiveFilters({}, { workItemTypeTab: 'bug' }), true)
})

test('toIssueQueryParams maps criteria onto the server query', () => {
  const params = toIssueQueryParams({
    assigneeId: 'user-1',
    priority: 'high',
    iterationId: 'sprint-1',
    areaId: 'area-1',
    search: '  redirect  ',
    labelIds: ['l1', 'l2'],
  })

  assert.equal(params.get('assigneeId'), 'user-1')
  assert.equal(params.get('priority'), 'high')
  assert.equal(params.get('iterationId'), 'sprint-1')
  assert.equal(params.get('areaId'), 'area-1')
  assert.equal(params.get('search'), 'redirect')
  assert.equal(params.get('labelIds'), 'l1,l2')
})

test('toIssueQueryParams prefers an explicit type over the tab', () => {
  assert.equal(
    toIssueQueryParams({ type: 'bug' }, { workItemTypeTab: 'task' }).get('workItemType'),
    'bug'
  )
  assert.equal(
    toIssueQueryParams({}, { workItemTypeTab: 'task' }).get('workItemType'),
    'task'
  )
  assert.equal(toIssueQueryParams({}, { workItemTypeTab: 'all' }).get('workItemType'), null)
})

test('toIssueQueryParams omits empty criteria rather than sending blanks', () => {
  const params = toIssueQueryParams({ assigneeId: null, search: '', labelIds: [] })
  assert.equal([...params.keys()].length, 0)
})
