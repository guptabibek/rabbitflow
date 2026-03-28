import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAutomationFailureArtifacts } from '../../src/lib/domain/automation-failure.ts'
import type { AutomationEvent } from '../../src/lib/domain/automation-rules.ts'

function event(overrides: Partial<AutomationEvent> = {}): AutomationEvent {
  return {
    type: 'issue:status_changed',
    projectId: 'project-1',
    issueId: 'issue-1',
    userId: 'user-1',
    issue: {
      id: 'issue-1',
      status: 'todo',
      priority: 'high',
      assigneeId: null,
      workItemType: 'bug',
      storyPoints: 3,
      labels: [],
    },
    ...overrides,
  }
}

test('buildAutomationFailureArtifacts: builds notification payload with failure context', () => {
  const artifacts = buildAutomationFailureArtifacts(
    {
      id: 'rule-1',
      projectId: 'project-1',
      name: 'Escalate stuck bugs',
      createdById: 'user-2',
    },
    event(),
    'Comment action failed',
    ['change_status']
  )

  assert.equal(artifacts.notification.type, 'automation_failed')
  assert.equal(artifacts.notification.title, 'Automation failed: Escalate stuck bugs')
  assert.equal(artifacts.notification.body, 'Comment action failed')
  assert.equal(artifacts.notification.entityType, 'automation_rule')
  assert.equal(artifacts.notification.entityId, 'rule-1')
  assert.deepEqual(artifacts.notification.metadata, {
    ruleId: 'rule-1',
    ruleName: 'Escalate stuck bugs',
    trigger: 'issue:status_changed',
    issueId: 'issue-1',
    executedActions: ['change_status'],
    error: 'Comment action failed',
  })
})

test('buildAutomationFailureArtifacts: builds audit entry with same failure details', () => {
  const artifacts = buildAutomationFailureArtifacts(
    {
      id: 'rule-9',
      projectId: 'project-1',
      name: 'Notify ops',
      createdById: null,
    },
    event({ type: 'issue:comment_added' }),
    'Notification action failed',
    []
  )

  assert.equal(artifacts.audit.action, 'automation_rule_failed')
  assert.deepEqual(artifacts.audit.details, {
    ruleId: 'rule-9',
    ruleName: 'Notify ops',
    trigger: 'issue:comment_added',
    executedActions: [],
    error: 'Notification action failed',
  })
})