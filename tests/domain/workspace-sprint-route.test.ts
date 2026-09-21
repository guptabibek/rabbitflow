import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_SPRINT_TEAMS,
  hasWorkspaceSprintRoute,
  parseWorkspaceSprintRoute,
  writeWorkspaceSprintRoute,
} from '../../src/lib/domain/workspace-sprint-route.ts'

test('sprint workspace selection round-trips without dropping filter state', () => {
  const params = writeWorkspaceSprintRoute('?search=payments', {
    selectedTeamId: 'team-2',
    selectedSprintId: 'sprint-8',
    activeTab: 'capacity',
    boardGroupBy: 'assignee',
    backlogGroupBy: 'priority',
  })

  assert.equal(params.get('search'), 'payments')
  assert.deepEqual(parseWorkspaceSprintRoute(params), {
    selectedTeamId: 'team-2',
    selectedSprintId: 'sprint-8',
    activeTab: 'capacity',
    boardGroupBy: 'assignee',
    backlogGroupBy: 'priority',
  })
})

test('invalid sprint route options fall back to safe defaults', () => {
  assert.deepEqual(parseWorkspaceSprintRoute('?sprintTab=delete&boardGroupBy=random'), {
    selectedTeamId: ALL_SPRINT_TEAMS,
    selectedSprintId: null,
    activeTab: 'backlog',
    boardGroupBy: 'none',
    backlogGroupBy: 'story',
  })
})

test('ceremony tabs remain linkable', () => {
  for (const activeTab of ['daily', 'review'] as const) {
    const params = writeWorkspaceSprintRoute('', {
      selectedTeamId: ALL_SPRINT_TEAMS,
      selectedSprintId: 'sprint-ceremony',
      activeTab,
      boardGroupBy: 'none',
      backlogGroupBy: 'story',
    })

    assert.equal(params.get('sprintTab'), activeTab)
    assert.equal(parseWorkspaceSprintRoute(params).activeTab, activeTab)
  }
})

test('default sprint route state stays out of the URL', () => {
  const params = writeWorkspaceSprintRoute('?panel=activity&sprintId=old', {
    selectedTeamId: ALL_SPRINT_TEAMS,
    selectedSprintId: null,
    activeTab: 'backlog',
    boardGroupBy: 'none',
    backlogGroupBy: 'story',
  })

  assert.equal(params.toString(), 'panel=activity')
  assert.equal(hasWorkspaceSprintRoute(params), false)
  assert.equal(hasWorkspaceSprintRoute('?sprintId=sprint-1'), true)
})
