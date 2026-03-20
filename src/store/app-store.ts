import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type User = {
  id: string
  email: string
  name: string
  avatar: string | null
  globalRole: string
  projectRole?: string
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
  _count?: { issues: number }
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
  setIssues: (issues: Issue[]) => void
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

  states: State[]
  setStates: (states: State[]) => void

  areas: Area[]
  setAreas: (areas: Area[]) => void

  hierarchyExpandedByProject: Record<string, string[]>
  setHierarchyExpandedIds: (projectId: string, ids: string[]) => void
  toggleHierarchyExpanded: (projectId: string, id: string) => void

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

  isCreateIssueOpen: boolean
  setCreateIssueOpen: (open: boolean) => void
  isSprintModalOpen: boolean
  setSprintModalOpen: (open: boolean) => void

  isLoading: boolean
  setIsLoading: (loading: boolean) => void

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
      setIssues: (issues) => set({ issues }),
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

      states: [],
      setStates: (states) => set({ states }),

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

      isCreateIssueOpen: false,
      setCreateIssueOpen: (open) => set({ isCreateIssueOpen: open }),
      isSprintModalOpen: false,
      setSprintModalOpen: (open) => set({ isSprintModalOpen: open }),

      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),

      resetProjectContext: () =>
        set({
          activeProjectId: null,
          currentProject: null,
          currentProjectRole: null,
          currentProjectPermissions: [],
          issues: [],
          users: [],
          labels: [],
          iterations: [],
          teams: [],
          workItemTypes: [],
          states: [],
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
      }),
    }
  )
)
