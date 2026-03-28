import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasPermission,
  hasAnyScopedPermission,
  listPermissions,
  normalizeProjectRole,
} from '../../src/lib/domain/rbac.ts'

test('normalizeProjectRole maps legacy roles to enterprise roles', () => {
  assert.equal(normalizeProjectRole('owner'), 'Admin')
  assert.equal(normalizeProjectRole('member'), 'Dev')
  assert.equal(normalizeProjectRole('QA'), 'QA')
  assert.equal(normalizeProjectRole('unknown'), 'Viewer')
})

test('permission checks reflect role capabilities', () => {
  assert.equal(hasPermission('PM', 'sprint:manage'), true)
  assert.equal(hasPermission('Dev', 'sprint:manage'), false)
  assert.equal(hasPermission('QA', 'workitem:comment'), true)
  assert.equal(hasPermission('DevOps', 'operations:manage'), true)
  assert.equal(hasPermission('PM', 'branding:manage'), false)
})

test('listPermissions returns the normalized permission set', () => {
  assert.deepEqual(listPermissions('Viewer').sort(), [
    'activity:read',
    'calendar:read',
    'collaboration:read',
    'dependency:read',
    'portfolio:read',
    'project:read',
    'roadmap:read',
    'workitem:read',
  ])
})

test('area-scoped rules can deny inherited permissions', () => {
  assert.equal(
    hasPermission('PM', 'workitem:update', {
      rules: [{ role: 'PM', permission: 'workitem:update', effect: 'deny', areaId: 'area-1' }],
      areaId: 'area-1',
    }),
    false
  )
})

test('scoped permissions can grant access even when project-level permission is absent', () => {
  const rules = [
    { role: 'Viewer', permission: 'workitem:create', effect: 'allow', areaId: 'area-42' },
  ]

  assert.equal(hasPermission('Viewer', 'workitem:create', { rules, areaId: 'area-42' }), true)
  assert.equal(hasAnyScopedPermission('Viewer', 'workitem:create', rules), true)
})

test('extra member permissions add targeted capabilities without changing the base role', () => {
  assert.equal(hasPermission('Viewer', 'test:manage'), false)
  assert.equal(
    hasPermission('Viewer', 'test:manage', { extraPermissions: ['test:manage'] }),
    true
  )
  assert.equal(
    listPermissions('Viewer', { extraPermissions: ['test:manage'] }).includes('test:manage'),
    true
  )
})
