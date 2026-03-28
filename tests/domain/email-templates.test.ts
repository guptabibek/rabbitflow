import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMentionEmail,
  buildAssignmentEmail,
  buildPasswordResetEmail,
  buildUserOnboardingEmail,
} from '../../src/lib/domain/email-templates.ts'

// ---------------------------------------------------------------------------
// buildMentionEmail
// ---------------------------------------------------------------------------

test('buildMentionEmail: returns subject, html, and text', () => {
  const result = buildMentionEmail({
    recipientName: 'Alice',
    actorName: 'Bob',
    issueKey: 'PM-42',
    issueTitle: 'Fix login bug',
    projectKey: 'PM',
    commentPreview: 'Hey @Alice, can you look at this?',
    actionUrl: 'https://example.com/work-items/42',
  })

  assert.ok(result.subject.includes('PM'))
  assert.ok(result.subject.includes('Bob'))
  assert.ok(result.subject.includes('PM-42'))
  assert.ok(result.html.includes('Bob'))
  assert.ok(result.html.includes('PM-42'))
  assert.ok(result.html.includes('Fix login bug'))
  assert.ok(result.html.includes('https://example.com/work-items/42'))
  assert.ok(result.text.includes('Bob'))
  assert.ok(result.text.includes('PM-42'))
})

test('buildMentionEmail: HTML-escapes actor name with special characters', () => {
  const result = buildMentionEmail({
    recipientName: 'Alice',
    actorName: 'Bob <script>alert(1)</script>',
    issueKey: 'PM-1',
    issueTitle: 'Test',
    projectKey: 'PM',
    commentPreview: 'Hello',
    actionUrl: 'https://example.com',
  })

  assert.ok(!result.html.includes('<script>'))
  assert.ok(result.html.includes('&lt;script&gt;'))
})

test('buildMentionEmail: handles empty comment preview', () => {
  const result = buildMentionEmail({
    recipientName: 'Alice',
    actorName: 'Bob',
    issueKey: 'PM-1',
    issueTitle: 'Test',
    projectKey: 'PM',
    commentPreview: '',
    actionUrl: 'https://example.com',
  })

  assert.ok(typeof result.html === 'string')
  assert.ok(typeof result.text === 'string')
})

// ---------------------------------------------------------------------------
// buildAssignmentEmail
// ---------------------------------------------------------------------------

test('buildAssignmentEmail: returns correct structure', () => {
  const result = buildAssignmentEmail({
    assigneeName: 'Charlie',
    actorName: 'Diana',
    issueKey: 'DEV-99',
    issueTitle: 'Implement feature',
    projectKey: 'DEV',
    actionUrl: 'https://example.com/work-items/99',
  })

  assert.ok(result.subject.includes('DEV'))
  assert.ok(result.subject.includes('DEV-99'))
  assert.ok(result.html.includes('Diana'))
  assert.ok(result.html.includes('DEV-99'))
  assert.ok(result.html.includes('Implement feature'))
  assert.ok(result.text.includes('Diana'))
  assert.ok(result.text.includes('DEV-99'))
})

// ---------------------------------------------------------------------------
// buildPasswordResetEmail
// ---------------------------------------------------------------------------

test('buildPasswordResetEmail: includes OTP code', () => {
  const result = buildPasswordResetEmail({
    userName: 'Eve',
    otpCode: '482917',
  })

  assert.ok(result.subject.includes('Password Reset'))
  assert.ok(result.html.includes('482917'))
  assert.ok(result.text.includes('482917'))
  assert.ok(result.text.includes('Eve'))
})

test('buildPasswordResetEmail: HTML-escapes OTP with special chars', () => {
  const result = buildPasswordResetEmail({
    userName: 'User',
    otpCode: '<b>123</b>',
  })

  assert.ok(!result.html.includes('<b>123</b>'))
  assert.ok(result.html.includes('&lt;b&gt;123&lt;/b&gt;'))
})

// ---------------------------------------------------------------------------
// buildUserOnboardingEmail
// ---------------------------------------------------------------------------

test('buildUserOnboardingEmail: includes user name and temp password', () => {
  const result = buildUserOnboardingEmail({
    userName: 'Frank',
    temporaryPassword: 'TmpP@ss123!',
    loginUrl: 'https://app.example.com/login',
  })

  assert.ok(result.subject.includes('account'))
  assert.ok(result.html.includes('Frank'))
  assert.ok(result.html.includes('TmpP@ss123!'))
  assert.ok(result.html.includes('https://app.example.com/login'))
  assert.ok(result.text.includes('Frank'))
  assert.ok(result.text.includes('TmpP@ss123!'))
  assert.ok(result.text.includes('https://app.example.com/login'))
})

test('buildUserOnboardingEmail: includes project name when provided', () => {
  const result = buildUserOnboardingEmail({
    userName: 'Grace',
    temporaryPassword: 'abc123',
    loginUrl: 'https://app.example.com/login',
    projectName: 'Project Alpha',
  })

  assert.ok(result.html.includes('Project Alpha'))
  assert.ok(result.text.includes('Project Alpha'))
})

test('buildUserOnboardingEmail: omits project line when null', () => {
  const result = buildUserOnboardingEmail({
    userName: 'Grace',
    temporaryPassword: 'abc123',
    loginUrl: 'https://app.example.com/login',
    projectName: null,
  })

  // When projectName is null, the badge assignment line should not appear
  assert.ok(!result.html.includes('Project Alpha'))
})
