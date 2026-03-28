import { db } from '@/lib/db'
import { createAuditLog } from '@/lib/domain/audit'
import { buildAutomationFailureArtifacts } from '@/lib/domain/automation-failure'
import { evaluateCondition } from '@/lib/domain/automation-rules'
import {
  getProjectAuditActorUserId,
  notifyProjectOperators,
} from '@/lib/domain/notification-service'
import { statusFromStateCategory } from '@/lib/domain/state-machine'
import type { TriggerType, ActionType, ConditionOperator, RuleCondition, RuleAction, AutomationEvent } from '@/lib/domain/automation-rules'

export { evaluateCondition }
export type { TriggerType, ActionType, ConditionOperator, RuleCondition, RuleAction, AutomationEvent }

// ============================================================================
// AUTOMATION RULES ENGINE
// ============================================================================

const TRIGGER_ALIASES: Record<string, TriggerType> = {
  issue_created: 'issue:created',
  issue_updated: 'issue:updated',
  status_changed: 'issue:status_changed',
  assignee_changed: 'issue:assigned',
  comment_added: 'issue:comment_added',
  label_changed: 'issue:label_changed',
  'issue:created': 'issue:created',
  'issue:updated': 'issue:updated',
  'issue:status_changed': 'issue:status_changed',
  'issue:assigned': 'issue:assigned',
  'issue:comment_added': 'issue:comment_added',
  'issue:label_changed': 'issue:label_changed',
  'issue:due_date_passed': 'issue:due_date_passed',
}

type ActionExecutionResult = {
  success: boolean
  error?: string
}

function normalizeTriggerType(value: unknown): TriggerType | null {
  if (typeof value !== 'string') {
    return null
  }

  return TRIGGER_ALIASES[value] ?? null
}

async function executeAction(action: RuleAction, event: AutomationEvent): Promise<ActionExecutionResult> {
  try {
    switch (action.type) {
      case 'set_field': {
        if (!action.field || action.value === undefined) {
          return { success: false, error: 'set_field requires both field and value' }
        }
        const updateData: Record<string, unknown> = {}
        if (action.field === 'dueDate') {
          updateData[action.field] = typeof action.value === 'string' ? new Date(action.value) : null
        } else {
          updateData[action.field] = action.value
        }
        await db.issue.update({ where: { id: event.issueId }, data: updateData })
        return { success: true }
      }
      case 'change_status': {
        if (typeof action.value !== 'string') {
          return { success: false, error: 'change_status requires a string value' }
        }

        const mappedState = await db.state.findUnique({
          where: { id: action.value },
          select: { id: true, category: true },
        })

        await db.issue.update({
          where: { id: event.issueId },
          data: mappedState
            ? {
                stateId: mappedState.id,
                status: statusFromStateCategory(mappedState.category),
              }
            : { status: action.value },
        })
        return { success: true }
      }
      case 'assign_user': {
        const assigneeId = typeof action.value === 'string' ? action.value : null
        await db.issue.update({ where: { id: event.issueId }, data: { assigneeId } })
        return { success: true }
      }
      case 'add_label': {
        if (typeof action.value !== 'string') {
          return { success: false, error: 'add_label requires a label ID' }
        }
        await db.issueLabel.createMany({
          data: [{ issueId: event.issueId, labelId: action.value }],
          skipDuplicates: true,
        })
        return { success: true }
      }
      case 'remove_label': {
        if (typeof action.value !== 'string') {
          return { success: false, error: 'remove_label requires a label ID' }
        }
        await db.issueLabel.deleteMany({
          where: { issueId: event.issueId, labelId: action.value },
        })
        return { success: true }
      }
      case 'add_comment': {
        if (typeof action.value !== 'string') {
          return { success: false, error: 'add_comment requires comment text' }
        }
        await db.comment.create({
          data: {
            issueId: event.issueId,
            authorId: event.userId,
            content: action.value,
          },
        })
        return { success: true }
      }
      case 'move_to_iteration': {
        if (typeof action.value !== 'string') {
          return { success: false, error: 'move_to_iteration requires an iteration ID' }
        }
        await db.issue.update({
          where: { id: event.issueId },
          data: { iterationId: action.value },
        })
        return { success: true }
      }
      default:
        return { success: false, error: `Unsupported action type: ${action.type}` }
    }
  } catch (error) {
    console.error('Automation action error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown automation action error',
    }
  }
}

async function surfaceAutomationFailure(
  rule: {
    id: string
    projectId: string
    name: string
    createdById: string | null
  },
  event: AutomationEvent,
  errorMessage: string,
  executedActions: string[]
) {
  const failureArtifacts = buildAutomationFailureArtifacts(rule, event, errorMessage, executedActions)
  const auditActorUserId = await getProjectAuditActorUserId(
    rule.projectId,
    event.userId ?? rule.createdById
  )

  await notifyProjectOperators(rule.projectId, {
    ...failureArtifacts.notification,
  })

  if (auditActorUserId) {
    await createAuditLog({
      projectId: rule.projectId,
      issueId: event.issueId,
      userId: auditActorUserId,
      action: failureArtifacts.audit.action,
      details: failureArtifacts.audit.details,
    })
  }
}

export async function evaluateAutomationRules(event: AutomationEvent): Promise<void> {
  const rules = await db.automationRule.findMany({
    where: {
      projectId: event.projectId,
      isActive: true,
    },
    orderBy: { order: 'asc' },
  })

  // Filter rules matching the trigger type
  const matchingRules = rules.filter((rule) => {
    const trigger = rule.trigger as Record<string, unknown> | string
    const triggerType = typeof trigger === 'string' ? trigger : trigger?.type
    return normalizeTriggerType(triggerType) === normalizeTriggerType(event.type)
  })

  for (const rule of matchingRules) {
    const startedAt = Date.now()

    try {
      const conditions = rule.conditions as unknown as RuleCondition[] | null
      const actions = rule.actions as unknown as RuleAction[]

      const conditionsMet =
        !conditions ||
        conditions.length === 0 ||
        conditions.every((c) => evaluateCondition(c, event.issue))

      if (!conditionsMet) {
        continue
      }

      const executedActions: string[] = []
      const actionErrors: string[] = []

      for (const action of actions) {
        const result = await executeAction(action, event)
        if (result.success) {
          executedActions.push(action.type)
        } else {
          actionErrors.push(result.error ?? `Action failed: ${action.type}`)
        }
      }

      const errorMessage = actionErrors.length > 0 ? actionErrors.join(' | ') : null
      const status =
        actionErrors.length === 0
          ? 'success'
          : executedActions.length > 0
            ? 'partial_failure'
            : 'failure'

      await db.automationLog.create({
        data: {
          ruleId: rule.id,
          projectId: event.projectId,
          issueId: event.issueId,
          triggeredBy: event.userId,
          status,
          actionsRun: executedActions,
          error: errorMessage,
          duration: Date.now() - startedAt,
        },
      })

      await db.automationRule.update({
        where: { id: rule.id },
        data: {
          runCount: { increment: 1 },
          lastRunAt: new Date(),
          lastError: errorMessage,
        },
      })

      if (errorMessage) {
        await surfaceAutomationFailure(rule, event, errorMessage, executedActions)
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown automation execution error'

      await db.automationLog.create({
        data: {
          ruleId: rule.id,
          projectId: event.projectId,
          issueId: event.issueId,
          triggeredBy: event.userId,
          status: 'failure',
          actionsRun: [],
          error: errorMessage,
          duration: Date.now() - startedAt,
        },
      })

      await db.automationRule.update({
        where: { id: rule.id },
        data: {
          runCount: { increment: 1 },
          lastRunAt: new Date(),
          lastError: errorMessage,
        },
      })

      await surfaceAutomationFailure(rule, event, errorMessage, [])
    }
  }
}

export async function getAutomationRules(projectId: string) {
  return db.automationRule.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    include: {
      _count: { select: { logs: true } },
    },
  })
}
