// Pure automation rule evaluation extracted for testability (no @/ imports)
// Re-exported by automation-service.ts

export type TriggerType =
  | 'issue:created'
  | 'issue:updated'
  | 'issue:status_changed'
  | 'issue:assigned'
  | 'issue:comment_added'
  | 'issue:label_changed'
  | 'issue:due_date_passed'

export type ActionType =
  | 'set_field'
  | 'add_label'
  | 'remove_label'
  | 'assign_user'
  | 'change_status'
  | 'add_comment'
  | 'send_notification'
  | 'move_to_iteration'

export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'in' | 'not_in' | 'gt' | 'lt' | 'is_empty' | 'is_not_empty'

function normalizeOperator(operator: string): ConditionOperator | null {
  switch (operator) {
    case 'greater_than':
      return 'gt'
    case 'less_than':
      return 'lt'
    case 'gt':
    case 'lt':
    case 'equals':
    case 'not_equals':
    case 'contains':
    case 'not_contains':
    case 'in':
    case 'not_in':
    case 'is_empty':
    case 'is_not_empty':
      return operator
    default:
      return null
  }
}

export type RuleCondition = {
  field: string
  operator: ConditionOperator
  value: string | string[] | number | boolean | null
}

export type RuleAction = {
  type: ActionType
  field?: string
  value?: string | string[] | number | boolean | null
}

export type AutomationEvent = {
  type: TriggerType
  projectId: string
  issueId: string
  userId: string
  changes?: Record<string, { from: unknown; to: unknown }>
  issue: {
    id: string
    status: string
    priority: string
    assigneeId: string | null
    workItemType: string
    storyPoints: number | null
    labels: Array<{ id: string; name: string }>
    [key: string]: unknown
  }
}

export function evaluateCondition(condition: RuleCondition, issue: AutomationEvent['issue']): boolean {
  const fieldValue = issue[condition.field]
  const operator = normalizeOperator(condition.operator)

  if (!operator) {
    return false
  }

  switch (operator) {
    case 'equals':
      return fieldValue === condition.value
    case 'not_equals':
      return fieldValue !== condition.value
    case 'contains':
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue.toLowerCase().includes(condition.value.toLowerCase())
      }
      if (Array.isArray(fieldValue) && typeof condition.value === 'string') {
        return fieldValue.some((v) =>
          typeof v === 'object' && v !== null && 'name' in v
            ? (v as { name: string }).name.toLowerCase() === condition.value!.toString().toLowerCase()
            : v === condition.value
        )
      }
      return false
    case 'not_contains':
      return !evaluateCondition({ ...condition, operator: 'contains' }, issue)
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(String(fieldValue))
    case 'not_in':
      return Array.isArray(condition.value) && !condition.value.includes(String(fieldValue))
    case 'gt':
      return typeof fieldValue === 'number' && typeof condition.value === 'number' && fieldValue > condition.value
    case 'lt':
      return typeof fieldValue === 'number' && typeof condition.value === 'number' && fieldValue < condition.value
    case 'is_empty':
      return fieldValue === null || fieldValue === undefined || fieldValue === ''
    case 'is_not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== ''
    default:
      return false
  }
}
