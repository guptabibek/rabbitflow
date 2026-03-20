import test from 'node:test'
import assert from 'node:assert/strict'
import { customFieldValuesToRecord } from '../../src/lib/domain/work-item-schema.ts'

test('customFieldValuesToRecord maps string field values', () => {
  const result = customFieldValuesToRecord([
    {
      fieldDefinition: { key: 'hypothesis', dataType: 'text' },
      stringValue: 'Our hypothesis statement',
      numberValue: null,
      booleanValue: null,
      dateValue: null,
      jsonValue: null,
    },
  ])

  assert.deepEqual(result, { hypothesis: 'Our hypothesis statement' })
})

test('customFieldValuesToRecord maps number field values', () => {
  const result = customFieldValuesToRecord([
    {
      fieldDefinition: { key: 'effort', dataType: 'number' },
      stringValue: null,
      numberValue: 42,
      booleanValue: null,
      dateValue: null,
      jsonValue: null,
    },
  ])

  assert.deepEqual(result, { effort: 42 })
})

test('customFieldValuesToRecord maps boolean field values', () => {
  const result = customFieldValuesToRecord([
    {
      fieldDefinition: { key: 'approved', dataType: 'boolean' },
      stringValue: null,
      numberValue: null,
      booleanValue: true,
      dateValue: null,
      jsonValue: null,
    },
  ])

  assert.deepEqual(result, { approved: true })
})

test('customFieldValuesToRecord maps date field values to ISO strings', () => {
  const date = new Date('2026-03-15T00:00:00.000Z')
  const result = customFieldValuesToRecord([
    {
      fieldDefinition: { key: 'target_date', dataType: 'date' },
      stringValue: null,
      numberValue: null,
      booleanValue: null,
      dateValue: date,
      jsonValue: null,
    },
  ])

  assert.deepEqual(result, { target_date: date.toISOString() })
})

test('customFieldValuesToRecord returns null for null date values', () => {
  const result = customFieldValuesToRecord([
    {
      fieldDefinition: { key: 'target_date', dataType: 'date' },
      stringValue: null,
      numberValue: null,
      booleanValue: null,
      dateValue: null,
      jsonValue: null,
    },
  ])

  assert.deepEqual(result, { target_date: null })
})

test('customFieldValuesToRecord maps multi_select from jsonValue', () => {
  const result = customFieldValuesToRecord([
    {
      fieldDefinition: { key: 'platforms', dataType: 'multi_select' },
      stringValue: null,
      numberValue: null,
      booleanValue: null,
      dateValue: null,
      jsonValue: ['web', 'mobile', 'desktop'],
    },
  ])

  assert.deepEqual(result, { platforms: ['web', 'mobile', 'desktop'] })
})

test('customFieldValuesToRecord returns empty array for non-array jsonValue on multi_select', () => {
  const result = customFieldValuesToRecord([
    {
      fieldDefinition: { key: 'platforms', dataType: 'multi_select' },
      stringValue: null,
      numberValue: null,
      booleanValue: null,
      dateValue: null,
      jsonValue: 'invalid',
    },
  ])

  assert.deepEqual(result, { platforms: [] })
})

test('customFieldValuesToRecord maps single_select via default string branch', () => {
  const result = customFieldValuesToRecord([
    {
      fieldDefinition: { key: 'severity', dataType: 'single_select' },
      stringValue: 'critical',
      numberValue: null,
      booleanValue: null,
      dateValue: null,
      jsonValue: null,
    },
  ])

  assert.deepEqual(result, { severity: 'critical' })
})

test('customFieldValuesToRecord handles mixed field types in a single call', () => {
  const date = new Date('2026-06-01T00:00:00.000Z')
  const result = customFieldValuesToRecord([
    {
      fieldDefinition: { key: 'hypothesis', dataType: 'text' },
      stringValue: 'Test hypothesis',
      numberValue: null,
      booleanValue: null,
      dateValue: null,
      jsonValue: null,
    },
    {
      fieldDefinition: { key: 'effort', dataType: 'number' },
      stringValue: null,
      numberValue: 8,
      booleanValue: null,
      dateValue: null,
      jsonValue: null,
    },
    {
      fieldDefinition: { key: 'approved', dataType: 'boolean' },
      stringValue: null,
      numberValue: null,
      booleanValue: false,
      dateValue: null,
      jsonValue: null,
    },
    {
      fieldDefinition: { key: 'deadline', dataType: 'date' },
      stringValue: null,
      numberValue: null,
      booleanValue: null,
      dateValue: date,
      jsonValue: null,
    },
    {
      fieldDefinition: { key: 'tags', dataType: 'multi_select' },
      stringValue: null,
      numberValue: null,
      booleanValue: null,
      dateValue: null,
      jsonValue: ['frontend', 'backend'],
    },
  ])

  assert.deepEqual(result, {
    hypothesis: 'Test hypothesis',
    effort: 8,
    approved: false,
    deadline: date.toISOString(),
    tags: ['frontend', 'backend'],
  })
})

test('customFieldValuesToRecord returns empty record for empty input', () => {
  assert.deepEqual(customFieldValuesToRecord([]), {})
})
