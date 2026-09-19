export type SprintTab = 'overview' | 'board' | 'backlog' | 'capacity'
export type SprintGroupBy = 'none' | 'status' | 'assignee' | 'priority' | 'story'

export type WorkspaceSprintRouteState = {
  selectedTeamId: string
  selectedSprintId: string | null
  activeTab: SprintTab
  boardGroupBy: SprintGroupBy
  backlogGroupBy: SprintGroupBy
}

export const ALL_SPRINT_TEAMS = '__all_teams__'

const CONTROLLED_KEYS = [
  'teamId',
  'sprintId',
  'sprintTab',
  'boardGroupBy',
  'backlogGroupBy',
] as const
const TABS = new Set<SprintTab>(['overview', 'board', 'backlog', 'capacity'])
const GROUPS = new Set<SprintGroupBy>(['none', 'status', 'assignee', 'priority', 'story'])

function boundedId(value: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed.slice(0, 200) : null
}

export function hasWorkspaceSprintRoute(search: string | URLSearchParams) {
  const params = new URLSearchParams(search)
  return CONTROLLED_KEYS.some((key) => params.has(key))
}

export function parseWorkspaceSprintRoute(
  search: string | URLSearchParams
): WorkspaceSprintRouteState {
  const params = new URLSearchParams(search)
  const tab = params.get('sprintTab') as SprintTab | null
  const boardGroup = params.get('boardGroupBy') as SprintGroupBy | null
  const backlogGroup = params.get('backlogGroupBy') as SprintGroupBy | null

  return {
    selectedTeamId: boundedId(params.get('teamId')) ?? ALL_SPRINT_TEAMS,
    selectedSprintId: boundedId(params.get('sprintId')),
    activeTab: tab && TABS.has(tab) ? tab : 'backlog',
    boardGroupBy: boardGroup && GROUPS.has(boardGroup) ? boardGroup : 'none',
    backlogGroupBy: backlogGroup && GROUPS.has(backlogGroup) ? backlogGroup : 'story',
  }
}

export function writeWorkspaceSprintRoute(
  search: string | URLSearchParams,
  state: WorkspaceSprintRouteState
) {
  const params = new URLSearchParams(search)
  for (const key of CONTROLLED_KEYS) params.delete(key)

  if (state.selectedTeamId && state.selectedTeamId !== ALL_SPRINT_TEAMS) {
    params.set('teamId', state.selectedTeamId)
  }
  if (state.selectedSprintId) params.set('sprintId', state.selectedSprintId)
  if (state.activeTab !== 'backlog') params.set('sprintTab', state.activeTab)
  if (state.boardGroupBy !== 'none') params.set('boardGroupBy', state.boardGroupBy)
  if (state.backlogGroupBy !== 'story') params.set('backlogGroupBy', state.backlogGroupBy)

  return params
}
