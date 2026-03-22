import test from 'node:test'
import assert from 'node:assert/strict'
import { issuesToCsv, getProjectHealth, percentile, median } from '../../src/lib/domain/report-helpers.ts'

// ---------------------------------------------------------------------------
// issuesToCsv
// ---------------------------------------------------------------------------

test('issuesToCsv generates header and rows', () => {
  const issues = [
    { key: 'PM-1', title: 'Fix login', status: 'done' },
    { key: 'PM-2', title: 'Dashboard', status: 'todo' },
  ]
  const csv = issuesToCsv(issues, ['key', 'title', 'status'])
  const lines = csv.split('\n')
  assert.equal(lines[0], 'key,title,status')
  assert.equal(lines[1], 'PM-1,Fix login,done')
  assert.equal(lines[2], 'PM-2,Dashboard,todo')
})

test('issuesToCsv escapes commas in values', () => {
  const issues = [{ key: 'PM-3', title: 'Fix, refactor, deploy' }]
  const csv = issuesToCsv(issues, ['key', 'title'])
  assert.ok(csv.includes('"Fix, refactor, deploy"'))
})

test('issuesToCsv escapes double quotes in values', () => {
  const issues = [{ key: 'PM-4', title: 'Use "quotes" here' }]
  const csv = issuesToCsv(issues, ['key', 'title'])
  assert.ok(csv.includes('"Use ""quotes"" here"'))
})

test('issuesToCsv handles null and undefined values', () => {
  const issues = [{ key: 'PM-5', title: null, status: undefined }]
  const csv = issuesToCsv(issues, ['key', 'title', 'status'])
  assert.equal(csv.split('\n')[1], 'PM-5,,')
})

test('issuesToCsv escapes newlines in values', () => {
  const issues = [{ key: 'PM-6', title: 'line1\nline2' }]
  const csv = issuesToCsv(issues, ['key', 'title'])
  assert.ok(csv.includes('"line1\nline2"'))
})

test('issuesToCsv neutralizes spreadsheet formulas', () => {
  const issues = [{ key: 'PM-8', title: '=HYPERLINK("http://evil")' }]
  const csv = issuesToCsv(issues, ['key', 'title'])
  assert.ok(csv.includes('"\'=HYPERLINK(""http://evil"")"'))
})

test('issuesToCsv returns only header for empty issues', () => {
  const csv = issuesToCsv([], ['key', 'title'])
  assert.equal(csv, 'key,title')
})

test('issuesToCsv with missing columns returns empty cells', () => {
  const issues = [{ key: 'PM-7' }]
  const csv = issuesToCsv(issues, ['key', 'title', 'priority'])
  assert.equal(csv.split('\n')[1], 'PM-7,,')
})

// ---------------------------------------------------------------------------
// getProjectHealth
// ---------------------------------------------------------------------------

test('getProjectHealth returns healthy for empty project', () => {
  assert.equal(getProjectHealth(0, 0, 0, 0), 'healthy')
})

test('getProjectHealth returns healthy when progress is good', () => {
  assert.equal(getProjectHealth(100, 50, 20, 5), 'healthy')
})

test('getProjectHealth returns at-risk when bug ratio > 15%', () => {
  assert.equal(getProjectHealth(100, 50, 20, 16), 'at-risk')
})

test('getProjectHealth returns at-risk when low progress', () => {
  assert.equal(getProjectHealth(100, 20, 10, 5), 'at-risk')
})

test('getProjectHealth returns critical when bug ratio > 30%', () => {
  assert.equal(getProjectHealth(100, 50, 20, 31), 'critical')
})

test('getProjectHealth returns critical when no progress and no active work', () => {
  assert.equal(getProjectHealth(100, 5, 0, 0), 'critical')
})

// ---------------------------------------------------------------------------
// percentile
// ---------------------------------------------------------------------------

test('percentile returns 0 for empty array', () => {
  assert.equal(percentile([], 85), 0)
})

test('percentile returns p85 from sorted array', () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  assert.equal(percentile(sorted, 85), 9)
})

test('percentile returns max for p100', () => {
  assert.equal(percentile([1, 2, 3], 100), 3)
})

// ---------------------------------------------------------------------------
// median
// ---------------------------------------------------------------------------

test('median returns 0 for empty array', () => {
  assert.equal(median([]), 0)
})

test('median returns middle value for odd-length array', () => {
  assert.equal(median([1, 3, 5]), 3)
})

test('median returns average of two middle values for even-length array', () => {
  assert.equal(median([1, 3, 5, 7]), 4)
})
