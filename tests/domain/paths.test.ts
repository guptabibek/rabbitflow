import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHierarchyPath } from '../../src/lib/domain/paths.ts'

test('buildHierarchyPath joins parent and child segments predictably', () => {
  assert.equal(buildHierarchyPath('Sprint 24'), 'Sprint 24')
  assert.equal(
    buildHierarchyPath('Sprint 24', 'Delivery\\2026'),
    'Delivery / 2026 / Sprint 24'
  )
})
