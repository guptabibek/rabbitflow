/**
 * Onboarding Step Definitions – config-driven completion rules.
 *
 * Each step has a `completionRule` string key that maps to a resolver function.
 * The evaluation engine uses these to dynamically check user progress.
 */

export type OnboardingRole = 'Admin' | 'PM' | 'DevOps' | 'Dev' | 'QA' | 'Viewer'

export type StepDefinition = {
  key: string
  title: string
  description: string
  icon: string
  targetRoute: string | null
  ctaLabel: string
  ctaRoute: string | null
  completionRule: string
  roles: OnboardingRole[]
  order: number
}

/**
 * Default onboarding steps seeded into each new project.
 * Admins can later reorder, disable, or add new steps via the config API.
 */
export const DEFAULT_ONBOARDING_STEPS: StepDefinition[] = [
  {
    key: 'create_project',
    title: 'Create your first project',
    description: 'Set up a project to organize your work items and team.',
    icon: 'FolderKanban',
    targetRoute: 'dashboard',
    ctaLabel: 'Create Project',
    ctaRoute: 'dashboard',
    completionRule: 'has_project',
    roles: ['Admin', 'PM'],
    order: 0,
  },
  {
    key: 'invite_member',
    title: 'Invite a team member',
    description: 'Add at least one team member to collaborate with.',
    icon: 'UserPlus',
    targetRoute: null,
    ctaLabel: 'Manage Members',
    ctaRoute: 'teams',
    completionRule: 'has_team_member',
    roles: ['Admin', 'PM'],
    order: 10,
  },
  {
    key: 'create_issue',
    title: 'Create your first work item',
    description: 'Track work by creating an issue, task, or story.',
    icon: 'SquarePlus',
    targetRoute: null,
    ctaLabel: 'Create Work Item',
    ctaRoute: '__create_issue',
    completionRule: 'has_issue',
    roles: ['Admin', 'PM', 'Dev', 'QA'],
    order: 20,
  },
  {
    key: 'setup_board',
    title: 'View your Kanban board',
    description: 'Visualize work across status columns.',
    icon: 'LayoutDashboard',
    targetRoute: null,
    ctaLabel: 'Open Board',
    ctaRoute: 'board',
    completionRule: 'viewed_board',
    roles: ['Admin', 'PM', 'Dev', 'QA', 'DevOps'],
    order: 30,
  },
  {
    key: 'create_sprint',
    title: 'Plan your first sprint',
    description: 'Create a sprint/iteration to plan your team\'s work.',
    icon: 'Repeat',
    targetRoute: null,
    ctaLabel: 'Plan Sprint',
    ctaRoute: 'sprints',
    completionRule: 'has_sprint',
    roles: ['Admin', 'PM'],
    order: 40,
  },
  {
    key: 'assign_issue',
    title: 'Assign a work item',
    description: 'Assign work to a team member to start tracking progress.',
    icon: 'UserCheck',
    targetRoute: null,
    ctaLabel: 'View Backlog',
    ctaRoute: 'backlog',
    completionRule: 'has_assigned_issue',
    roles: ['Admin', 'PM', 'Dev'],
    order: 50,
  },
  {
    key: 'setup_team',
    title: 'Create a team',
    description: 'Organize members into teams for better sprint management.',
    icon: 'Users',
    targetRoute: null,
    ctaLabel: 'Create Team',
    ctaRoute: 'teams',
    completionRule: 'has_team',
    roles: ['Admin', 'PM'],
    order: 60,
  },
  {
    key: 'create_label',
    title: 'Add labels for categorization',
    description: 'Create labels to organize and filter work items.',
    icon: 'Tag',
    targetRoute: null,
    ctaLabel: 'Manage Labels',
    ctaRoute: null,
    completionRule: 'has_label',
    roles: ['Admin', 'PM'],
    order: 70,
  },
  {
    key: 'complete_issue',
    title: 'Complete your first work item',
    description: 'Move a work item to a "Done" state to track progress.',
    icon: 'CheckCircle',
    targetRoute: null,
    ctaLabel: 'View Board',
    ctaRoute: 'board',
    completionRule: 'has_completed_issue',
    roles: ['Admin', 'PM', 'Dev', 'QA'],
    order: 80,
  },
  {
    key: 'explore_reports',
    title: 'Check out reports',
    description: 'View velocity, burndown, and other project metrics.',
    icon: 'BarChart3',
    targetRoute: null,
    ctaLabel: 'View Reports',
    ctaRoute: 'reports',
    completionRule: 'viewed_reports',
    roles: ['Admin', 'PM'],
    order: 90,
  },
]

/**
 * Map of completionRule keys to human-readable descriptions.
 * Used in admin UI for understanding what each rule checks.
 */
export const COMPLETION_RULE_DESCRIPTIONS: Record<string, string> = {
  has_project: 'User is a member of at least one project',
  has_team_member: 'Project has more than one member',
  has_issue: 'At least one work item exists in the project',
  viewed_board: 'User has viewed the Kanban board (tracked by event)',
  has_sprint: 'At least one sprint/iteration exists in the project',
  has_assigned_issue: 'At least one work item has an assignee in the project',
  has_team: 'At least one team exists in the project',
  has_label: 'At least one label exists in the project',
  has_completed_issue: 'At least one work item is in a final/done state',
  viewed_reports: 'User has viewed the reports page (tracked by event)',
}
