import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalWorkspaceRoute,
  parseWorkspacePathname,
  workspaceViewFromSlug,
  workspaceViewSlug,
} from '../../src/lib/domain/workspace-route.ts'

test('canonicalWorkspaceRoute includes project and view and preserves supported query context', () => {
  assert.equal(
    canonicalWorkspaceRoute('project/a', 'board', '?view=list&sprint=current&assignee=me'),
    '/projects/project%2Fa/board?sprint=current&assignee=me'
  )
})

test('dashboard uses the user-facing overview slug', () => {
  assert.equal(workspaceViewSlug('dashboard'), 'overview')
  assert.equal(workspaceViewFromSlug('overview'), 'dashboard')
  assert.equal(workspaceViewFromSlug('dashboard'), 'dashboard')
})

test('parseWorkspacePathname validates the complete route', () => {
  assert.deepEqual(parseWorkspacePathname('/projects/project%2Fa/board'), {
    projectId: 'project/a',
    view: 'board',
  })
  assert.deepEqual(parseWorkspacePathname('/projects/p-1/overview/'), {
    projectId: 'p-1',
    view: 'dashboard',
  })
  assert.equal(parseWorkspacePathname('/projects/p-1/settings'), null)
  assert.equal(parseWorkspacePathname('/projects/p-1/board/extra'), null)
  assert.equal(parseWorkspacePathname('/projects/%E0%A4%A/board'), null)
})
