import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type User = {
  id: string
  email: string
  name: string
  avatar: string | null
  globalRole: string
  projectRole?: string
  extraPermissions?: string[]
}

export type Project = {
  id: string
  key: string
  name: string
  description: string | null
  color: string
  icon: string | null
  isArchived: boolean
  currentUserRole?: string
  _count?: { issues: number; members: number }
  members?: Array<{ user: User; role: string }>
}

export type Label = {
  id: string
  name: string
  color: string
  _count?: { issues: number }
}

export type Area = {
  id: string
  name: string
  path?: string | null
  parentId?: string | null
}

export type Iteration = {
  id: string
  name: string
  path?: string | null
  goal?: string | null
  status?: string
  iterationType: string
  teamId?: string | null
  team?: { id: string; name: string; color: string } | null
  startDate?: string | null
  endDate?: string | null
  _count?: { issues: number }
}

export type State = {
  id: string
  name: string
  color: string
  category: string
  order: number
  isFinal?: boolean
  _count?: { issues: number }
}

export type TypeStateMapping = {
  workItemTypeId: string
  stateId: string
  order: number
  isInitial: boolean
}

export type StateTransition = {
  workItemTypeId: string
  fromStateId: string
  toStateId: string
  order: number
  isEnabled: boolean
}

export type WorkItemType = string

export type WorkItemFieldDefinition = {
  id: string
  key: string
  label: string
  description?: string | null
  dataType: string
  required: boolean
  isSystem?: boolean
  placeholder?: string | null
  options?: string[] | null
  config?: Record<string, unknown> | null
  order: number
}

export type WorkItemSectionDefinition = {
  id: string
  key: string
  title: string
  description?: string | null
  sectionType: string
  isSystem?: boolean
  isCollapsible: boolean
  order: number
  fields: WorkItemFieldDefinition[]
}

export type WorkItemTypeDefinition = {
  id: string
  key: string
  name: string
  description?: string | null
  icon?: string | null
  color: string
  hierarchyLevel: number
  isSystem: boolean
  isEnabled: boolean
  order: number
  sections: WorkItemSectionDefinition[]
  fields: WorkItemFieldDefinition[]
  _count?: { issues: number }
}

export type WorkItemTemplate = {
  id: string
  name: string
  workItemType: WorkItemType
  description: string
  priority: string
  severity: string
  storyPoints: string
  estimatedHours: string
  assigneeId: string
  areaId: string
  labelIds: string[]
  customFields: Record<string, unknown>
}

type WorkItemCreationPreferences = {
  lastWorkItemTypeByProject: Record<string, WorkItemType>
  workItemTemplatesByProject: Record<string, WorkItemTemplate[]>
}

const WORK_ITEM_CREATION_PREFERENCES_KEY = 'rabbitflow-work-item-creation-preferences'

export function readWorkItemCreationPreferences(): WorkItemCreationPreferences {
  const empty: WorkItemCreationPreferences = {
    lastWorkItemTypeByProject: {},
    workItemTemplatesByProject: {},
  }
  if (typeof window === 'undefined') return empty

  try {
    const raw = window.localStorage.getItem(WORK_ITEM_CREATION_PREFERENCES_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<WorkItemCreationPreferences>
    return {
      lastWorkItemTypeByProject:
        parsed.lastWorkItemTypeByProject && typeof parsed.lastWorkItemTypeByProject === 'object'
          ? parsed.lastWorkItemTypeByProject
          : {},
      workItemTemplatesByProject:
        parsed.workItemTemplatesByProject && typeof parsed.workItemTemplatesByProject === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.workItemTemplatesByProject).map(([projectId, templates]) => [
                projectId,
                Array.isArray(templates)
                  ? templates.filter(
                      (template): template is WorkItemTemplate =>
                        Boolean(template) &&
                        typeof template === 'object' &&
                        typeof (template as WorkItemTemplate).id === 'string' &&
                        typeof (template as WorkItemTemplate).name === 'string'
                    )
                  : [],
              ])
            )
          : {},
    }
  } catch {
    return empty
  }
}

function writeWorkItemCreationPreferences(preferences: WorkItemCreationPreferences) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WORK_ITEM_CREATION_PREFERENCES_KEY, JSON.stringify(preferences))
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The
    // in-memory preference still works for the current session.
  }
}

export type Team = {
  id: string
  name: string
  key?: string | null
  description?: string | null
  color: string
  leadId?: string | null
  lead?: { id: string; name: string; email: string; avatar: string | null } | null
  members: Array<{
    id: string
    role: string
    userId: string
    user: { id: string; name: string; email: string; avatar: string | null }
  }>
  _count?: { iterations: number }
}

export type Issue = {
  id: string
  key: string
  title: string
  description: string | null
  workItemType: WorkItemType
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
  priority: 'lowest' | 'low' | 'medium' | 'high' | 'highest'
  severity?: 'critical' | 'high' | 'medium' | 'low' | null
  storyPoints: number | null
  estimatedHours?: number | null
  remainingHours?: number | null
  completedHours?: number | null
  dueDate: string | null
  startDate?: string | null
  completedDate?: string | null
  columnOrder: number
  createdAt?: string
  updatedAt?: string
  version?: number
  customFields?: Record<string, unknown>
  typeDefinition?: {
    key: string
    name: string
    icon?: string | null
    color: string
    hierarchyLevel: number
    sections?: WorkItemSectionDefinition[]
    fields?: WorkItemFieldDefinition[]
  } | null
  project: { id: string; key: string; name: string; color: string }
  assignee: { id: string; name: string; avatar: string | null } | null
  reporter: { id: string; name: string; avatar: string | null }
  parentIssueId?: string | null
  iteration?: {
    id: string
    name: string
    path?: string | null
    teamId?: string | null
    startDate?: string | null
    endDate?: string | null
  } | null
  area?: { id: string; name: string; path?: string | null } | null
  stateRecord?: { id: string; name: string; color: string; category: string; order: number } | null
  labels: Array<{ label: { id: string; name: string; color: string } }>
  fieldValues?: Array<{
    fieldDefinition: {
      id?: string
      key: string
      label?: string
      dataType: string
    }
    stringValue?: string | null
    numberValue?: number | null
    booleanValue?: boolean | null
    dateValue?: string | null
    jsonValue?: unknown
  }>
  _count?: { comments: number; subIssues: number; attachments: number }
  parentIssue?: { id: string; key: string; title: string; status: string; workItemType: WorkItemType } | null
  subIssues?: Array<{
    id: string
    key: string
    title: string
    status: string
    workItemType: WorkItemType
    assignee?: { id: string; name: string; avatar: string | null } | null
  }>
  sourceRelations?: Array<{
    id: string
    relationType: string
    targetIssue: { id: string; key: string; title: string; status: string; workItemType: WorkItemType }
  }>
  targetRelations?: Array<{
    id: string
    relationType: string
    sourceIssue: { id: string; key: string; title: string; status: string; workItemType: WorkItemType }
  }>
}

export type BoardViewPreferences = {
  collapsedStatuses: Issue['status'][]
  hideCompleted: boolean
  wipLimits: Partial<Record<Issue['status'], number>>
}

export type Comment = {
  id: string
  content: string
  contentFormat?: string
  createdAt: string
  updatedAt?: string
  author: { id: string; name: string; avatar: string | null }
  mentions?: Array<{
    id: string
    token: string
    userId: string
    user: { id: string; name: string; avatar: string | null }
  }>
  revisions?: Array<{
    id: string
    previousContent: string
    createdAt: string
    editor: { id: string; name: string; avatar: string | null }
  }>
}

export type Activity = {
  id: string
  action: string
  details: string | null
  createdAt: string
  user: { id: string; name: string; avatar: string | null }
  issue?: { key: string; title: string } | null
}

export type Attachment = {
  id: string
  fileName: string
  filePath: string
  fileSize: number
  mimeType: string
  uploadedBy: string
  uploadedAt: string
  user?: { id: string; name: string; avatar: string | null }
}

export type IssueRelation = {
  id: string
  sourceIssueId: string
  targetIssueId: string
  relationType: 'related' | 'blocked_by' | 'blocks' | 'duplicate_of' | 'tests' | 'tested_by'
  sourceIssue?: { id: string; key: string; title: string; status: string; workItemType: WorkItemType }
  targetIssue?: { id: string; key: string; title: string; status: string; workItemType: WorkItemType }
  linkedIssue?: { id: string; key: string; title: string; status: string; workItemType: WorkItemType }
}

interface AppState {
  currentUser: User | null
  setCurrentUser: (user: User | null) => void

  projects: Project[]
  currentProject: Project | null
  activeProjectId: string | null
  currentProjectRole: string | null
  currentProjectPermissions: string[]
  setProjects: (projects: Project[]) => void
  setCurrentProject: (project: Project | null) => void
  setActiveProjectId: (projectId: string | null) => void
  setProjectAccess: (payload: { role: string | null; permissions: string[] }) => void

  issues: Issue[]
  /** Work items the project actually has, which may exceed what is loaded. */
  issueTotal: number
  /** How many the client requested, so views can tell whether more exist. */
  issuePageSize: number
  setIssues: (issues: Issue[], meta?: { total?: number; pageSize?: number }) => void
  appendIssues: (issues: Issue[]) => void
  addIssue: (issue: Issue) => void
  updateIssue: (id: string, data: Partial<Issue>) => void
  removeIssue: (id: string) => void

  users: User[]
  setUsers: (users: User[]) => void

  labels: Label[]
  setLabels: (labels: Label[]) => void

  iterations: Iteration[]
  setIterations: (iterations: Iteration[]) => void

  teams: Team[]
  setTeams: (teams: Team[]) => void

  workItemTypes: WorkItemTypeDefinition[]
  setWorkItemTypes: (workItemTypes: WorkItemTypeDefinition[]) => void

  lastWorkItemTypeByProject: Record<string, WorkItemType>
  setLastWorkItemType: (projectId: string, workItemType: WorkItemType) => void
  workItemTemplatesByProject: Record<string, WorkItemTemplate[]>
  saveWorkItemTemplate: (projectId: string, template: WorkItemTemplate) => void
  removeWorkItemTemplate: (projectId: string, templateId: string) => void

  states: State[]
  setStates: (states: State[]) => void

  typeStateMappings: TypeStateMapping[]
  setTypeStateMappings: (mappings: TypeStateMapping[]) => void

  stateTransitions: StateTransition[]
  setStateTransitions: (transitions: StateTransition[]) => void

  areas: Area[]
  setAreas: (areas: Area[]) => void

  hierarchyExpandedByProject: Record<string, string[]>
  setHierarchyExpandedIds: (projectId: string, ids: string[]) => void
  toggleHierarchyExpanded: (projectId: string, id: string) => void

  boardViewPreferencesByProject: Record<string, BoardViewPreferences>
  setBoardViewPreferences: (
    projectId: string,
    preferences: Partial<BoardViewPreferences>
  ) => void

  viewMode: 'board' | 'list'
  setViewMode: (mode: 'board' | 'list') => void

  workItemTypeFilter: WorkItemType | 'all'
  setWorkItemTypeFilter: (type: WorkItemType | 'all') => void

  filters: {
    assigneeId: string | null
    priority: string | null
    type: string | null
    search: string
    sprintId: string | null
    iterationId: string | null
    areaId: string | null
    labelIds: string[]
  }
  setFilters: (filters: Partial<AppState['filters']>) => void

  sprintViewSelectionByProject: Record<
    string,
    {
      selectedTeamId: string
      selectedSprintId: string | null
      activeTab: 'overview' | 'board' | 'backlog' | 'capacity'
      boardGroupBy: 'none' | 'status' | 'assignee' | 'priority' | 'story'
      backlogGroupBy: 'none' | 'status' | 'assignee' | 'priority' | 'story'
    }
  >
  setSprintViewSelection: (
    projectId: string,
    selection: {
      selectedTeamId?: string
      selectedSprintId?: string | null
      activeTab?: 'overview' | 'board' | 'backlog' | 'capacity'
      boardGroupBy?: 'none' | 'status' | 'assignee' | 'priority' | 'story'
      backlogGroupBy?: 'none' | 'status' | 'assignee' | 'priority' | 'story'
    }
  ) => void

  isCreateIssueOpen: boolean
  setCreateIssueOpen: (open: boolean) => void
  isSprintModalOpen: boolean
  setSprintModalOpen: (open: boolean) => void

  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  openWorkItemId: string | null
  openWorkItem: (id: string) => void
  closeWorkItem: () => void

  unreadNotificationCount: number
  setUnreadNotificationCount: (count: number) => void

  resetProjectContext: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),

      projects: [],
      currentProject: null,
      activeProjectId: null,
      currentProjectRole: null,
      currentProjectPermissions: [],
      setProjects: (projects) =>
        set((state) => {
          const currentProject = state.activeProjectId
            ? projects.find((project) => project.id === state.activeProjectId) ?? null
            : state.currentProject
          return { projects, currentProject }
        }),
      setCurrentProject: (project) =>
        set({
          currentProject: project,
          activeProjectId: project?.id ?? null,
          currentProjectRole: project?.currentUserRole ?? null,
        }),
      setActiveProjectId: (projectId) =>
        set((state) => ({
          activeProjectId: projectId,
          currentProject:
            state.projects.find((project) => project.id === projectId) ?? state.currentProject,
        })),
      setProjectAccess: ({ role, permissions }) =>
        set({ currentProjectRole: role, currentProjectPermissions: permissions }),

      issues: [],
      issueTotal: 0,
      issuePageSize: 200,
      setIssues: (issues, meta) =>
        set({
          issues,
          // Fall back to the loaded length when the caller has no total, so
          // "showing X of Y" never claims more than it knows.
          issueTotal: meta?.total ?? issues.length,
          issuePageSize: meta?.pageSize ?? 200,
        }),
      appendIssues: (incoming) =>
        set((state) => {
          // De-duplicate: a concurrent create can arrive both from the
          // mutation response and the next page.
          const seen = new Set(state.issues.map((issue) => issue.id))
          const added = incoming.filter((issue) => !seen.has(issue.id))
          return { issues: [...state.issues, ...added] }
        }),
      addIssue: (issue) => set((state) => ({ issues: [...state.issues, issue] })),
      updateIssue: (id, data) =>
        set((state) => ({
          issues: state.issues.map((issue) =>
            issue.id === id ? { ...issue, ...data } : issue
          ),
        })),
      removeIssue: (id) =>
        set((state) => ({
          issues: state.issues.filter((issue) => issue.id !== id),
        })),

      users: [],
      setUsers: (users) => set({ users }),

      labels: [],
      setLabels: (labels) => set({ labels }),

      iterations: [],
      setIterations: (iterations) => set({ iterations }),

      teams: [],
      setTeams: (teams) => set({ teams }),

      workItemTypes: [],
      setWorkItemTypes: (workItemTypes) => set({ workItemTypes }),

      lastWorkItemTypeByProject: {},
      setLastWorkItemType: (projectId, workItemType) =>
        set((state) => {
          const stored = readWorkItemCreationPreferences()
          const lastWorkItemTypeByProject = {
            ...stored.lastWorkItemTypeByProject,
            ...state.lastWorkItemTypeByProject,
            [projectId]: workItemType,
          }
          writeWorkItemCreationPreferences({
            lastWorkItemTypeByProject,
            workItemTemplatesByProject: stored.workItemTemplatesByProject,
          })
          return { lastWorkItemTypeByProject }
        }),
      workItemTemplatesByProject: {},
      saveWorkItemTemplate: (projectId, template) =>
        set((state) => {
          const stored = readWorkItemCreationPreferences()
          const existing = state.workItemTemplatesByProject[projectId]
            ?? stored.workItemTemplatesByProject[projectId]
            ?? []
          const nextTemplates = existing.some((entry) => entry.id === template.id)
            ? existing.map((entry) => (entry.id === template.id ? template : entry))
            : [...existing, template]

          const workItemTemplatesByProject = {
            ...stored.workItemTemplatesByProject,
            ...state.workItemTemplatesByProject,
            [projectId]: nextTemplates,
          }
          writeWorkItemCreationPreferences({
            lastWorkItemTypeByProject: stored.lastWorkItemTypeByProject,
            workItemTemplatesByProject,
          })

          return {
            workItemTemplatesByProject,
          }
        }),
      removeWorkItemTemplate: (projectId, templateId) =>
        set((state) => {
          const stored = readWorkItemCreationPreferences()
          const existing = state.workItemTemplatesByProject[projectId]
            ?? stored.workItemTemplatesByProject[projectId]
            ?? []
          const workItemTemplatesByProject = {
            ...stored.workItemTemplatesByProject,
            ...state.workItemTemplatesByProject,
            [projectId]: existing.filter((template) => template.id !== templateId),
          }
          writeWorkItemCreationPreferences({
            lastWorkItemTypeByProject: stored.lastWorkItemTypeByProject,
            workItemTemplatesByProject,
          })
          return { workItemTemplatesByProject }
        }),

      states: [],
      setStates: (states) => set({ states }),

      typeStateMappings: [],
      setTypeStateMappings: (typeStateMappings) => set({ typeStateMappings }),

      stateTransitions: [],
      setStateTransitions: (stateTransitions) => set({ stateTransitions }),

      areas: [],
      setAreas: (areas) => set({ areas }),

      hierarchyExpandedByProject: {},
      setHierarchyExpandedIds: (projectId, ids) =>
        set((state) => ({
          hierarchyExpandedByProject: {
            ...state.hierarchyExpandedByProject,
            [projectId]: Array.from(new Set(ids)),
          },
        })),
      toggleHierarchyExpanded: (projectId, id) =>
        set((state) => {
          const current = new Set(state.hierarchyExpandedByProject[projectId] ?? [])
          if (current.has(id)) {
            current.delete(id)
          } else {
            current.add(id)
          }

          return {
            hierarchyExpandedByProject: {
              ...state.hierarchyExpandedByProject,
              [projectId]: Array.from(current),
            },
          }
        }),

      boardViewPreferencesByProject: {},
      setBoardViewPreferences: (projectId, preferences) =>
        set((state) => {
          const current = state.boardViewPreferencesByProject[projectId] ?? {
            collapsedStatuses: [],
            hideCompleted: false,
            wipLimits: {},
          }

          return {
            boardViewPreferencesByProject: {
              ...state.boardViewPreferencesByProject,
              [projectId]: {
                ...current,
                ...preferences,
                wipLimits: preferences.wipLimits ?? current.wipLimits,
              },
            },
          }
        }),

      viewMode: 'board',
      setViewMode: (mode) => set({ viewMode: mode }),

      workItemTypeFilter: 'all',
      setWorkItemTypeFilter: (type) => set({ workItemTypeFilter: type }),

      filters: {
        assigneeId: null,
        priority: null,
        type: null,
        search: '',
        sprintId: null,
        iterationId: null,
        areaId: null,
        labelIds: [],
      },
      setFilters: (filters) =>
        set((state) => ({ filters: { ...state.filters, ...filters } })),

      sprintViewSelectionByProject: {},
      setSprintViewSelection: (projectId, selection) =>
        set((state) => {
          const currentSelection = state.sprintViewSelectionByProject[projectId] ?? {
            selectedTeamId: '__all_teams__',
            selectedSprintId: null,
            activeTab: 'backlog',
            boardGroupBy: 'none',
            backlogGroupBy: 'story',
          }

          const nextSelection = {
            selectedTeamId: selection.selectedTeamId ?? currentSelection.selectedTeamId,
            selectedSprintId:
              selection.selectedSprintId !== undefined
                ? selection.selectedSprintId
                : currentSelection.selectedSprintId,
            activeTab: selection.activeTab ?? currentSelection.activeTab,
            boardGroupBy: selection.boardGroupBy ?? currentSelection.boardGroupBy,
            backlogGroupBy: selection.backlogGroupBy ?? currentSelection.backlogGroupBy,
          }

          if (
            nextSelection.selectedTeamId === currentSelection.selectedTeamId &&
            nextSelection.selectedSprintId === currentSelection.selectedSprintId &&
            nextSelection.activeTab === currentSelection.activeTab &&
            nextSelection.boardGroupBy === currentSelection.boardGroupBy &&
            nextSelection.backlogGroupBy === currentSelection.backlogGroupBy
          ) {
            return state
          }

          return {
            sprintViewSelectionByProject: {
              ...state.sprintViewSelectionByProject,
              [projectId]: nextSelection,
            },
          }
        }),

      isCreateIssueOpen: false,
      setCreateIssueOpen: (open) => set({ isCreateIssueOpen: open }),
      isSprintModalOpen: false,
      setSprintModalOpen: (open) => set({ isSprintModalOpen: open }),

      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),

      openWorkItemId: null,
      openWorkItem: (id) => set({ openWorkItemId: id }),
      closeWorkItem: () => set({ openWorkItemId: null }),

      unreadNotificationCount: 0,
      setUnreadNotificationCount: (count) => set({ unreadNotificationCount: count }),

      resetProjectContext: () =>
        set({
          activeProjectId: null,
          currentProject: null,
          currentProjectRole: null,
          currentProjectPermissions: [],
          issues: [],
          issueTotal: 0,
          users: [],
          labels: [],
          iterations: [],
          teams: [],
          workItemTypes: [],
          states: [],
          typeStateMappings: [],
          stateTransitions: [],
          areas: [],
          filters: {
            assigneeId: null,
            priority: null,
            type: null,
            search: '',
            sprintId: null,
            iterationId: null,
            areaId: null,
            labelIds: [],
          },
        }),
    }),
    {
      name: 'rabbitflow-app-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeProjectId: state.activeProjectId,
        hierarchyExpandedByProject: state.hierarchyExpandedByProject,
        boardViewPreferencesByProject: state.boardViewPreferencesByProject,
        sprintViewSelectionByProject: state.sprintViewSelectionByProject,
      }),
    }
  )
)
