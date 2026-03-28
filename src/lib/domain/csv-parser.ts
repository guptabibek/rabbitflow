// Pure CSV parsing functions extracted for testability (no @/ imports)
// Re-exported by import-service.ts

export const MAX_ROWS = 5000

export type FieldMapping = Record<string, string>

const FIELD_ALIASES: Record<string, string[]> = {
  title: ['title', 'name', 'summary'],
  description: ['description', 'details', 'body'],
  workItemType: ['workitemtype', 'issuetype', 'type'],
  status: ['status', 'state'],
  priority: ['priority', 'prio'],
  severity: ['severity'],
  storyPoints: ['storypoints', 'storypoint', 'points', 'sp'],
  estimatedHours: ['estimatedhours', 'estimatehours', 'estimate', 'hours'],
  dueDate: ['duedate', 'due'],
  assigneeEmail: ['assigneeemail', 'assignee', 'owneremail'],
  labels: ['labels', 'tags'],
  areaPath: ['areapath', 'area'],
  iterationPath: ['iterationpath', 'iteration', 'sprint'],
}

function normalizeHeaderName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function inferFieldMapping(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {}
  const usedTargets = new Set<string>()

  for (const header of headers) {
    const normalizedHeader = normalizeHeaderName(header)
    const matchedTarget = Object.entries(FIELD_ALIASES).find(([target, aliases]) => {
      return !usedTargets.has(target) && aliases.includes(normalizedHeader)
    })?.[0]

    if (!matchedTarget) {
      continue
    }

    mapping[header] = matchedTarget
    usedTargets.add(matchedTarget)
  }

  return mapping
}

export type ImportValidationResult = {
  valid: boolean
  totalRows: number
  previewRows: Array<Record<string, string>>
  headers: string[]
  errors: Array<{ row: number; field: string; message: string }>
  warnings: Array<{ row: number; field: string; message: string }>
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

export function parseCsv(raw: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = parseCsvLine(lines[0])
  const rows: Array<Record<string, string>> = []

  for (let i = 1; i < lines.length && i <= MAX_ROWS; i++) {
    const values = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]?.trim() ?? ''
    }
    rows.push(row)
  }

  return { headers, rows }
}

export function validateImportData(
  rows: Array<Record<string, string>>,
  fieldMapping: FieldMapping
): ImportValidationResult {
  const errors: Array<{ row: number; field: string; message: string }> = []
  const warnings: Array<{ row: number; field: string; message: string }> = []

  const titleField = Object.entries(fieldMapping).find(([, v]) => v === 'title')?.[0]

  if (!titleField) {
    errors.push({ row: 0, field: 'title', message: 'Title field mapping is required' })
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // 1-indexed + header

    if (titleField && !row[titleField]?.trim()) {
      errors.push({ row: rowNum, field: 'title', message: 'Title is required' })
    }

    const priorityField = Object.entries(fieldMapping).find(([, v]) => v === 'priority')?.[0]
    if (priorityField && row[priorityField]) {
      const validPriorities = ['lowest', 'low', 'medium', 'high', 'highest']
      if (!validPriorities.includes(row[priorityField].toLowerCase())) {
        warnings.push({
          row: rowNum,
          field: 'priority',
          message: `Invalid priority "${row[priorityField]}", will default to "medium"`,
        })
      }
    }

    const spField = Object.entries(fieldMapping).find(([, v]) => v === 'storyPoints')?.[0]
    if (spField && row[spField]) {
      const value = Number.parseInt(row[spField], 10)
      if (Number.isNaN(value) || value < 0 || value > 100) {
        errors.push({ row: rowNum, field: 'storyPoints', message: 'Story points must be 0-100' })
      }
    }
  }

  return {
    valid: errors.length === 0,
    totalRows: rows.length,
    previewRows: rows.slice(0, 5),
    headers: Object.keys(rows[0] ?? {}),
    errors: errors.slice(0, 100),
    warnings: warnings.slice(0, 100),
  }
}
