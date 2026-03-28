// Pure automation failure artifact helpers extracted for testability.

import type { AutomationEvent } from './automation-rules'

type AutomationFailureRule = {
  id: string
  projectId: string
  name: string
  createdById: string | null
}

export function buildAutomationFailureArtifacts(
  rule: AutomationFailureRule,
  event: AutomationEvent,
  errorMessage: string,
  executedActions: string[]
) {
  return {
    notification: {
      actorId: event.userId,
      issueId: event.issueId,
      type: 'automation_failed' as const,
      title: `Automation failed: ${rule.name}`,
      body: errorMessage,
      entityType: 'automation_rule',
      entityId: rule.id,
      metadata: {
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: event.type,
        issueId: event.issueId,
        executedActions,
        error: errorMessage,
      },
    },
    audit: {
      action: 'automation_rule_failed',
      details: {
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: event.type,
        executedActions,
        error: errorMessage,
      },
    },
  }
}