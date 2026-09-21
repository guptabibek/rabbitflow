import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_PLANNING_FILTERS,
  matchesPlanningFilters,
  parsePlanningFilters,
  writePlanningFilters,
} from '../../src/lib/domain/planning-filters.ts'

const item = {
  assignee: { id: 'owner-1' },
  area: { id: 'area-1' },
  iteration: { id: 'release-1', iterationType: 'release', team: { id: 'team-1' } },
  objectives: [{ id: 'objective-1' }],
  workItemType: 'feature',
  status: 'in_progress',
  startDate: '2026-09-10T00:00:00.000Z',
  dueDate: '2026-09-20T00:00:00.000Z',
}

test('planning filters round-trip without removing unrelated route state', () => {
  const filters = {
    ownerId: 'owner-1',
    teamId: 'team-1',
    areaId: 'area-1',
    objectiveId: 'objective-1',
    workItemType: 'feature',
    status: 'in_progress',
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
    releaseId: 'release-1',
  }
  const params = writePlanningFilters('?panel=details', filters)
  assert.equal(params.get('panel'), 'details')
  assert.deepEqual(parsePlanningFilters(params), filters)
})

test('planning filters match every supported planning dimension', () => {
  assert.equal(matchesPlanningFilters(item, {
    ownerId: 'owner-1', teamId: 'team-1', areaId: 'area-1', objectiveId: 'objective-1',
    workItemType: 'feature', status: 'in_progress', dateFrom: '2026-09-15',
    dateTo: '2026-09-16', releaseId: 'release-1',
  }), true)
  assert.equal(matchesPlanningFilters(item, { ...EMPTY_PLANNING_FILTERS, teamId: 'other' }), false)
  assert.equal(matchesPlanningFilters(item, { ...EMPTY_PLANNING_FILTERS, dateFrom: '2026-09-21' }), false)
  assert.equal(matchesPlanningFilters(item, { ...EMPTY_PLANNING_FILTERS, dateTo: '2026-09-09' }), false)
})

test('invalid planning dates are discarded while identifiers are bounded', () => {
  assert.deepEqual(parsePlanningFilters('?planFrom=tomorrow&planTo=2026-09-20'), {
    ...EMPTY_PLANNING_FILTERS,
    dateTo: '2026-09-20',
  })
})
