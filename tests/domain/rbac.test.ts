import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasPermission,
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
})

test('listPermissions returns the normalized permission set', () => {
  assert.deepEqual(listPermissions('Viewer').sort(), ['project:read', 'workitem:read'])
})
