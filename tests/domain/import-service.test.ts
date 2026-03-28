import test from 'node:test'
import assert from 'node:assert/strict'
import { inferFieldMapping, parseCsv, parseCsvLine, validateImportData } from '../../src/lib/domain/csv-parser.ts'
import { extractProjectIssueNumber, formatProjectIssueKey } from '../../src/lib/domain/issue-key-format.ts'

// ---------------------------------------------------------------------------
// parseCsvLine
// ---------------------------------------------------------------------------

test('parseCsvLine: splits a simple comma-separated line', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c'])
})

test('parseCsvLine: handles quoted fields containing commas', () => {
  assert.deepEqual(parseCsvLine('a,"b,c",d'), ['a', 'b,c', 'd'])
})

test('parseCsvLine: handles escaped double-quotes inside quoted fields', () => {
  assert.deepEqual(parseCsvLine('a,"say ""hello""",c'), ['a', 'say "hello"', 'c'])
})

test('parseCsvLine: handles empty fields', () => {
  assert.deepEqual(parseCsvLine('a,,c'), ['a', '', 'c'])
})

test('parseCsvLine: handles trailing comma', () => {
  assert.deepEqual(parseCsvLine('a,b,'), ['a', 'b', ''])
})

test('parseCsvLine: handles single field', () => {
  assert.deepEqual(parseCsvLine('hello'), ['hello'])
})

test('parseCsvLine: handles empty string', () => {
  assert.deepEqual(parseCsvLine(''), [''])
})

test('parseCsvLine: handles quoted field with newline characters', () => {
  // A single logical line that happens to have a literal newline in a quoted field
  assert.deepEqual(parseCsvLine('"line1\nline2",b'), ['line1\nline2', 'b'])
})

// ---------------------------------------------------------------------------
// parseCsv
// ---------------------------------------------------------------------------

test('parseCsv: parses basic CSV with header + data rows', () => {
  const result = parseCsv('title,status\nFix bug,todo\nAdd feature,in_progress')
  assert.deepEqual(result.headers, ['title', 'status'])
  assert.equal(result.rows.length, 2)
  assert.deepEqual(result.rows[0], { title: 'Fix bug', status: 'todo' })
  assert.deepEqual(result.rows[1], { title: 'Add feature', status: 'in_progress' })
})

test('parseCsv: returns empty for blank input', () => {
  const result = parseCsv('')
  assert.deepEqual(result, { headers: [], rows: [] })
})

test('parseCsv: returns empty for whitespace-only input', () => {
  const result = parseCsv('   \n  \n  ')
  assert.deepEqual(result, { headers: [], rows: [] })
})

test('parseCsv: handles header-only CSV', () => {
  const result = parseCsv('title,status')
  assert.deepEqual(result.headers, ['title', 'status'])
  assert.equal(result.rows.length, 0)
})

test('parseCsv: trims values in rows', () => {
  const result = parseCsv('title,status\n  Fix bug  , todo ')
  assert.equal(result.rows[0].title, 'Fix bug')
  assert.equal(result.rows[0].status, 'todo')
})

test('parseCsv: handles Windows-style CRLF line endings', () => {
  const result = parseCsv('title,status\r\nFix bug,done\r\n')
  assert.deepEqual(result.headers, ['title', 'status'])
  assert.equal(result.rows.length, 1)
  assert.deepEqual(result.rows[0], { title: 'Fix bug', status: 'done' })
})

test('parseCsv: row with fewer values fills missing columns as empty strings', () => {
  const result = parseCsv('a,b,c\n1')
  assert.equal(result.rows[0].a, '1')
  assert.equal(result.rows[0].b, '')
  assert.equal(result.rows[0].c, '')
})

test('parseCsv: limits to MAX_ROWS (5000) rows', () => {
  const header = 'title'
  const lines = [header]
  for (let i = 0; i < 5100; i++) lines.push(`row${i}`)
  const result = parseCsv(lines.join('\n'))
  assert.equal(result.rows.length, 5000)
})

// ---------------------------------------------------------------------------
// validateImportData
// ---------------------------------------------------------------------------

test('validateImportData: valid data with title mapping passes', () => {
  const rows = [{ Name: 'Task 1' }, { Name: 'Task 2' }]
  const mapping = { Name: 'title' }
  const result = validateImportData(rows, mapping)
  assert.equal(result.valid, true)
  assert.equal(result.errors.length, 0)
  assert.equal(result.totalRows, 2)
})

test('validateImportData: missing title mapping produces error', () => {
  const rows = [{ Name: 'Task 1' }]
  const mapping = { Name: 'description' }
  const result = validateImportData(rows, mapping)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.field === 'title' && e.message.includes('required')))
})

test('validateImportData: empty title in row produces error', () => {
  const rows = [{ Name: '' }, { Name: 'Valid' }]
  const mapping = { Name: 'title' }
  const result = validateImportData(rows, mapping)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.field === 'title' && e.row === 2))
})

test('validateImportData: invalid priority generates warning', () => {
  const rows = [{ Name: 'Task', Priority: 'super_high' }]
  const mapping = { Name: 'title', Priority: 'priority' }
  const result = validateImportData(rows, mapping)
  assert.equal(result.valid, true) // warnings don't block validity
  assert.ok(result.warnings.some((w) => w.field === 'priority'))
})

test('validateImportData: valid priority does not produce warning', () => {
  const rows = [{ Name: 'Task', Priority: 'High' }]
  const mapping = { Name: 'title', Priority: 'priority' }
  const result = validateImportData(rows, mapping)
  assert.equal(result.warnings.filter((w) => w.field === 'priority').length, 0)
})

test('validateImportData: invalid storyPoints produces error', () => {
  const rows = [{ Name: 'Task', SP: 'abc' }]
  const mapping = { Name: 'title', SP: 'storyPoints' }
  const result = validateImportData(rows, mapping)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.field === 'storyPoints'))
})

test('validateImportData: storyPoints out of range produces error', () => {
  const rows = [{ Name: 'Task', SP: '200' }]
  const mapping = { Name: 'title', SP: 'storyPoints' }
  const result = validateImportData(rows, mapping)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.field === 'storyPoints'))
})

test('validateImportData: storyPoints 0 is valid', () => {
  const rows = [{ Name: 'Task', SP: '0' }]
  const mapping = { Name: 'title', SP: 'storyPoints' }
  const result = validateImportData(rows, mapping)
  assert.equal(result.errors.filter((e) => e.field === 'storyPoints').length, 0)
})

test('validateImportData: storyPoints 100 is valid', () => {
  const rows = [{ Name: 'Task', SP: '100' }]
  const mapping = { Name: 'title', SP: 'storyPoints' }
  const result = validateImportData(rows, mapping)
  assert.equal(result.errors.filter((e) => e.field === 'storyPoints').length, 0)
})

test('validateImportData: previewRows limited to 5', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ Name: `Task ${i}` }))
  const mapping = { Name: 'title' }
  const result = validateImportData(rows, mapping)
  assert.equal(result.previewRows.length, 5)
})

test('validateImportData: errors limited to 100', () => {
  const rows = Array.from({ length: 200 }, () => ({ Name: '' }))
  const mapping = { Name: 'title' }
  const result = validateImportData(rows, mapping)
  assert.ok(result.errors.length <= 100)
})

// ---------------------------------------------------------------------------
// inferFieldMapping
// ---------------------------------------------------------------------------

test('inferFieldMapping: maps common CSV headers to supported system fields', () => {
  const mapping = inferFieldMapping([
    'Name',
    'Priority',
    'Story Points',
    'Assignee Email',
    'Due Date',
  ])

  assert.deepEqual(mapping, {
    Name: 'title',
    Priority: 'priority',
    'Story Points': 'storyPoints',
    'Assignee Email': 'assigneeEmail',
    'Due Date': 'dueDate',
  })
})

test('inferFieldMapping: keeps only the first match for a target field', () => {
  const mapping = inferFieldMapping(['Title', 'Name', 'Type'])

  assert.deepEqual(mapping, {
    Title: 'title',
    Type: 'workItemType',
  })
})

// ---------------------------------------------------------------------------
// issue key helpers
// ---------------------------------------------------------------------------

test('formatProjectIssueKey: builds the expected project issue key', () => {
  assert.equal(formatProjectIssueKey('RBT', 42), 'RBT-42')
})

test('extractProjectIssueNumber: extracts the numeric suffix for the same project key', () => {
  assert.equal(extractProjectIssueNumber('RBT-42', 'RBT'), 42)
})

test('extractProjectIssueNumber: rejects keys from a different project', () => {
  assert.equal(extractProjectIssueNumber('OPS-42', 'RBT'), null)
})

test('extractProjectIssueNumber: supports multi-digit issue numbers', () => {
  assert.equal(extractProjectIssueNumber('RBT-1007', 'RBT'), 1007)
})
