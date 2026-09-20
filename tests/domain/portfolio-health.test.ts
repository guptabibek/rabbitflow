import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePortfolioHealth } from '../../src/lib/domain/portfolio-health.ts'

test('portfolio health distinguishes no delivery data from a perfect score', () => {
  assert.deepEqual(calculatePortfolioHealth({ totalWork: 0, openWork: 0, overdueWork: 0, blockedWork: 0 }), {
    state: 'no_data',
    label: 'No delivery data',
    score: null,
    signals: { openWork: 0, overdueWork: 0, blockedWork: 0, overduePercent: 0, blockedPercent: 0 },
  })
})

test('portfolio health exposes the exact signals and thresholds behind the label', () => {
  assert.deepEqual(calculatePortfolioHealth({ totalWork: 20, openWork: 10, overdueWork: 5, blockedWork: 5 }), {
    state: 'at_risk',
    label: 'At risk',
    score: 50,
    signals: { openWork: 10, overdueWork: 5, blockedWork: 5, overduePercent: 50, blockedPercent: 50 },
  })
  assert.equal(calculatePortfolioHealth({ totalWork: 10, openWork: 10, overdueWork: 1, blockedWork: 1 }).state, 'healthy')
  assert.equal(calculatePortfolioHealth({ totalWork: 10, openWork: 10, overdueWork: 3, blockedWork: 2 }).state, 'watch')
})

test('portfolio health clamps inconsistent counts to open work', () => {
  const result = calculatePortfolioHealth({ totalWork: 4, openWork: 2, overdueWork: 7, blockedWork: 8 })
  assert.equal(result.signals.overdueWork, 2)
  assert.equal(result.signals.blockedWork, 2)
  assert.equal(result.score, 0)
})
