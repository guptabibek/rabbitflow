import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { sanitizeRichText } from '@/lib/domain/content'
import { toPrismaJsonValue } from '@/lib/domain/prisma-json'
import { ensureProjectSystemRecords } from '@/lib/domain/project-bootstrap'

type LoadedFieldDefinition = Awaited<ReturnType<typeof getProjectWorkItemTypeDefinition>>['fields'][number]

export type WorkItemFieldInput =
  | string
  | number
  | boolean
  | string[]
  | null
  | undefined

export type WorkItemTypeDefinitionInput = {
  key: string
  name: string
  description?: string | null
  icon?: string | null
  color?: string | null
  hierarchyLevel?: number
  isEnabled?: boolean
  sections: Array<{
    key: string
    title: string
    description?: string | null
    sectionType?: string
    isCollapsible?: boolean
    fields: Array<{
      key: string
      label: string
      description?: string | null
      dataType: string
      required?: boolean
      placeholder?: string | null
      options?: string[]
      config?: Record<string, unknown> | null
    }>
  }>
}

export type PreparedFieldWrite = {
  fieldDefinitionId: string
  projectId: string
  stringValue: string | null
  numberValue: number | null
  booleanValue: boolean | null
  dateValue: Date | null
  jsonValue: Prisma.InputJsonValue | typeof Prisma.JsonNull
}

export async function getProjectWorkItemTypes(
  projectId: string,
  options?: { includeDisabled?: boolean }
) {
  await ensureProjectSystemRecords(projectId)

  return db.workItemTypeDefinition.findMany({
    where: {
      projectId,
      ...(options?.includeDisabled ? {} : { isEnabled: true }),
    },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: {
          fields: {
            orderBy: { order: 'asc' },
          },
        },
      },
      fields: {
        orderBy: { order: 'asc' },
      },
      _count: {
        select: { issues: true },
      },
    },
  })
}

export async function getProjectWorkItemTypeDefinition(projectId: string, typeKey: string) {
  await ensureProjectSystemRecords(projectId)

  const typeDefinition = await db.workItemTypeDefinition.findUnique({
    where: {
      projectId_key: {
        projectId,
        key: typeKey,
      },
    },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: {
          fields: {
            orderBy: { order: 'asc' },
          },
        },
      },
      fields: {
        orderBy: { order: 'asc' },
      },
    },
  })

  if (!typeDefinition) {
    throw new UnknownWorkItemTypeError(typeKey)
  }

  return typeDefinition
}

/**
 * Raised when a caller names a work-item type the project does not define.
 *
 * A distinct class so callers can map it to 400 rather than letting it surface
 * as a 500: the type key comes straight from the request body, so an unknown
 * value is a client error, not a server fault. It previously escaped as a bare
 * Error past route handlers that only catch ZodError.
 *
 * The message deliberately omits the project id, which used to be interpolated
 * into an error that could reach a client.
 */
export class UnknownWorkItemTypeError extends Error {
  readonly typeKey: string

  constructor(typeKey: string) {
    super(`Unknown work item type "${typeKey}"`)
    this.name = 'UnknownWorkItemTypeError'
    this.typeKey = typeKey
  }
}

function getOptionsArray(field: LoadedFieldDefinition) {
  return Array.isArray(field.options)
    ? field.options.filter((option): option is string => typeof option === 'string')
    : []
}

function getValidationConfig(field: LoadedFieldDefinition) {
  if (!field.config || typeof field.config !== 'object' || Array.isArray(field.config)) {
    return {}
  }

  return field.config as Record<string, unknown>
}

function validateValueType(
  field: LoadedFieldDefinition,
  value: WorkItemFieldInput
): OmitResult | ErrorResult {
  if (value == null || value === '') {
    if (field.required) {
      return { ok: false, error: `${field.label} is required` }
    }

    return {
      ok: true,
      write: {
        stringValue: null,
        numberValue: null,
        booleanValue: null,
        dateValue: null,
        jsonValue: Prisma.JsonNull,
      },
    }
  }

  switch (field.dataType) {
    case 'text':
    case 'markdown':
    case 'user':
    case 'iteration':
    case 'area':
    case 'team': {
      if (typeof value !== 'string') {
        return { ok: false, error: `${field.label} must be a string` }
      }

      const normalizedValueRaw =
        field.dataType === 'markdown' ? sanitizeRichText(value) : value.trim()
      const normalizedValue = normalizedValueRaw ?? ''

      if (field.required && normalizedValue.length === 0) {
        return { ok: false, error: `${field.label} is required` }
      }
      const config = getValidationConfig(field)

      const minLength =
        typeof config.minLength === 'number' && Number.isFinite(config.minLength)
          ? config.minLength
          : null
      const maxLength =
        typeof config.maxLength === 'number' && Number.isFinite(config.maxLength)
          ? config.maxLength
          : null
      const regex = typeof config.regex === 'string' && config.regex.length > 0 ? config.regex : null

      if (minLength !== null && normalizedValue.length < minLength) {
        return {
          ok: false,
          error: `${field.label} must be at least ${minLength} characters long`,
        }
      }

      if (maxLength !== null && normalizedValue.length > maxLength) {
        return {
          ok: false,
          error: `${field.label} must be at most ${maxLength} characters long`,
        }
      }

      if (regex) {
        try {
          const pattern = new RegExp(regex)
          if (!pattern.test(normalizedValue)) {
            return {
              ok: false,
              error: `${field.label} does not match the required format`,
            }
          }
        } catch {
          return {
            ok: false,
            error: `${field.label} has an invalid regex validation rule`,
          }
        }
      }

      return {
        ok: true,
        write: {
          stringValue: normalizedValue,
          numberValue: null,
          booleanValue: null,
          dateValue: null,
          jsonValue: Prisma.JsonNull,
        },
      }
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return { ok: false, error: `${field.label} must be a number` }
      }

      const config = getValidationConfig(field)
      const min = typeof config.min === 'number' && Number.isFinite(config.min) ? config.min : null
      const max = typeof config.max === 'number' && Number.isFinite(config.max) ? config.max : null

      if (min !== null && value < min) {
        return { ok: false, error: `${field.label} must be greater than or equal to ${min}` }
      }

      if (max !== null && value > max) {
        return { ok: false, error: `${field.label} must be less than or equal to ${max}` }
      }

      return {
        ok: true,
        write: {
          stringValue: null,
          numberValue: value,
          booleanValue: null,
          dateValue: null,
          jsonValue: Prisma.JsonNull,
        },
      }
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        return { ok: false, error: `${field.label} must be true or false` }
      }

      return {
        ok: true,
        write: {
          stringValue: null,
          numberValue: null,
          booleanValue: value,
          dateValue: null,
          jsonValue: Prisma.JsonNull,
        },
      }
    }
    case 'date': {
      if (typeof value !== 'string') {
        return { ok: false, error: `${field.label} must be a valid date` }
      }

      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: `${field.label} must be a valid date` }
      }

      return {
        ok: true,
        write: {
          stringValue: null,
          numberValue: null,
          booleanValue: null,
          dateValue: parsed,
          jsonValue: Prisma.JsonNull,
        },
      }
    }
    case 'single_select': {
      if (typeof value !== 'string') {
        return { ok: false, error: `${field.label} must be a single value` }
      }

      const options = getOptionsArray(field)
      if (options.length > 0 && !options.includes(value)) {
        return { ok: false, error: `${field.label} contains an unsupported value` }
      }

      return {
        ok: true,
        write: {
          stringValue: value,
          numberValue: null,
          booleanValue: null,
          dateValue: null,
          jsonValue: Prisma.JsonNull,
        },
      }
    }
    case 'dropdown': {
      if (typeof value !== 'string') {
        return { ok: false, error: `${field.label} must be a single value` }
      }

      const options = getOptionsArray(field)
      if (options.length > 0 && !options.includes(value)) {
        return { ok: false, error: `${field.label} contains an unsupported value` }
      }

      return {
        ok: true,
        write: {
          stringValue: value,
          numberValue: null,
          booleanValue: null,
          dateValue: null,
          jsonValue: Prisma.JsonNull,
        },
      }
    }
    case 'multi_select': {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        return { ok: false, error: `${field.label} must be a list of values` }
      }

      const options = getOptionsArray(field)
      if (
        options.length > 0 &&
        value.some((selectedOption) => !options.includes(selectedOption))
      ) {
        return { ok: false, error: `${field.label} contains an unsupported value` }
      }

      return {
        ok: true,
        write: {
          stringValue: null,
          numberValue: null,
          booleanValue: null,
          dateValue: null,
          jsonValue: value as Prisma.InputJsonValue,
        },
      }
    }
    default:
      return { ok: false, error: `${field.label} uses unsupported field type` }
  }
}

type ErrorResult = { ok: false; error: string }
type OmitResult = {
  ok: true
  write: Omit<PreparedFieldWrite, 'fieldDefinitionId' | 'projectId'>
}

export async function prepareCustomFieldWrites(
  projectId: string,
  typeKey: string,
  customFields: Record<string, WorkItemFieldInput> | undefined,
  mode: 'create' | 'update'
) {
  // Returned as a validation failure rather than thrown, so the caller reports
  // 400 like every other bad-input case on this path.
  let typeDefinition: Awaited<ReturnType<typeof getProjectWorkItemTypeDefinition>>
  try {
    typeDefinition = await getProjectWorkItemTypeDefinition(projectId, typeKey)
  } catch (error) {
    if (error instanceof UnknownWorkItemTypeError) {
      return { ok: false as const, error: error.message }
    }
    throw error
  }

  const fieldMap = new Map(typeDefinition.fields.map((field) => [field.key, field]))
  const payload = customFields ?? {}

  for (const fieldKey of Object.keys(payload)) {
    if (!fieldMap.has(fieldKey)) {
      return {
        ok: false as const,
        error: `Unknown field "${fieldKey}" for ${typeDefinition.name}`,
      }
    }
  }

  const writes: PreparedFieldWrite[] = []

  for (const field of typeDefinition.fields) {
    const provided = Object.prototype.hasOwnProperty.call(payload, field.key)

    if (mode === 'update' && !provided) {
      continue
    }

    const result = validateValueType(field, payload[field.key])

    if (!result.ok) {
      return { ok: false as const, error: result.error }
    }

    writes.push({
      fieldDefinitionId: field.id,
      projectId,
      ...result.write,
    })
  }

  return {
    ok: true as const,
    typeDefinition,
    writes,
  }
}

export function customFieldValuesToRecord(
  values: Array<{
    fieldDefinition: { key: string; dataType: string }
    stringValue: string | null
    numberValue: number | null
    booleanValue: boolean | null
    dateValue: Date | null
    jsonValue: unknown
  }>
) {
  const record: Record<string, unknown> = {}

  for (const value of values) {
    switch (value.fieldDefinition.dataType) {
      case 'number':
        record[value.fieldDefinition.key] = value.numberValue
        break
      case 'boolean':
        record[value.fieldDefinition.key] = value.booleanValue
        break
      case 'date':
        record[value.fieldDefinition.key] = value.dateValue?.toISOString() ?? null
        break
      case 'multi_select':
        record[value.fieldDefinition.key] = Array.isArray(value.jsonValue)
          ? value.jsonValue
          : []
        break
      default:
        record[value.fieldDefinition.key] = value.stringValue
    }
  }

  return record
}

export async function saveWorkItemTypeDefinition(
  projectId: string,
  input: WorkItemTypeDefinitionInput,
  existingId?: string
) {
  return db.$transaction(async (tx) => {
    const existing = existingId
      ? await tx.workItemTypeDefinition.findUnique({
          where: { id: existingId },
          include: {
            sections: {
              include: {
                fields: {
                  include: {
                    _count: {
                      select: { values: true },
                    },
                  },
                },
              },
            },
          },
        })
      : null

    if (existing && existing.projectId !== projectId) {
      throw new Error('Work item type does not belong to the selected project')
    }

    const nextTypeOrder = existing
      ? undefined
      : ((
          await tx.workItemTypeDefinition.aggregate({
            where: { projectId },
            _max: { order: true },
          })
        )._max.order ?? 0) + 10

    const typeDefinition = existing
      ? await tx.workItemTypeDefinition.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            description: input.description ?? null,
            icon: input.icon ?? null,
            color: input.color ?? '#64748b',
            hierarchyLevel: input.hierarchyLevel ?? 4,
            isEnabled: input.isEnabled ?? true,
          },
        })
      : await tx.workItemTypeDefinition.create({
          data: {
            projectId,
            key: input.key,
            name: input.name,
            description: input.description ?? null,
            icon: input.icon ?? null,
            color: input.color ?? '#64748b',
            hierarchyLevel: input.hierarchyLevel ?? 4,
            isSystem: false,
            isEnabled: input.isEnabled ?? true,
            order: nextTypeOrder,
          },
        })

    const providedSectionKeys = new Set(input.sections.map((section) => section.key))
    const providedFieldKeys = new Set(
      input.sections.flatMap((section) => section.fields.map((field) => field.key))
    )

    for (const [sectionIndex, section] of input.sections.entries()) {
      const sectionRecord = await tx.workItemSectionDefinition.upsert({
        where: {
          workItemTypeId_key: {
            workItemTypeId: typeDefinition.id,
            key: section.key,
          },
        },
        update: {
          title: section.title,
          description: section.description ?? null,
          sectionType: section.sectionType ?? 'fields',
          order: sectionIndex * 10,
          isCollapsible: section.isCollapsible ?? false,
        },
        create: {
          projectId,
          workItemTypeId: typeDefinition.id,
          key: section.key,
          title: section.title,
          description: section.description ?? null,
          sectionType: section.sectionType ?? 'fields',
          order: sectionIndex * 10,
          isSystem: false,
          isCollapsible: section.isCollapsible ?? false,
        },
      })

      for (const [fieldIndex, field] of section.fields.entries()) {
        const fieldRecord = await tx.workItemFieldDefinition.upsert({
          where: {
            workItemTypeId_key: {
              workItemTypeId: typeDefinition.id,
              key: field.key,
            },
          },
          update: {
            sectionId: sectionRecord.id,
            label: field.label,
            description: field.description ?? null,
            dataType: field.dataType,
            required: field.required ?? false,
            placeholder: field.placeholder ?? null,
            options: toPrismaJsonValue(field.options),
            config: toPrismaJsonValue(field.config),
            order: fieldIndex * 10,
          },
          create: {
            projectId,
            workItemTypeId: typeDefinition.id,
            sectionId: sectionRecord.id,
            key: field.key,
            label: field.label,
            description: field.description ?? null,
            dataType: field.dataType,
            required: field.required ?? false,
            isSystem: false,
            isQueryable: true,
            placeholder: field.placeholder ?? null,
            options: toPrismaJsonValue(field.options),
            config: toPrismaJsonValue(field.config),
            order: fieldIndex * 10,
          },
          select: {
            id: true,
          },
        })

        await tx.workItemTypeFieldMapping.upsert({
          where: {
            workItemTypeId_fieldDefinitionId: {
              workItemTypeId: typeDefinition.id,
              fieldDefinitionId: fieldRecord.id,
            },
          },
          update: {
            projectId,
            sectionId: sectionRecord.id,
            groupKey: section.key === 'planning' ? 'planning' : section.key,
            order: fieldIndex * 10,
            requiredOverride: field.required ?? false,
            isVisible: true,
          },
          create: {
            projectId,
            workItemTypeId: typeDefinition.id,
            fieldDefinitionId: fieldRecord.id,
            sectionId: sectionRecord.id,
            groupKey: section.key === 'planning' ? 'planning' : section.key,
            order: fieldIndex * 10,
            requiredOverride: field.required ?? false,
            isVisible: true,
          },
        })
      }
    }

    if (existing) {
      for (const section of existing.sections) {
        if (providedSectionKeys.has(section.key) || section.isSystem) {
          continue
        }

        const fieldWithValues = section.fields.find((field) => field._count.values > 0)
        if (fieldWithValues) {
          throw new Error(
            `Cannot remove section "${section.title}" because field "${fieldWithValues.label}" already has stored values`
          )
        }

        await tx.workItemSectionDefinition.delete({ where: { id: section.id } })
      }

      const existingFields = existing.sections.flatMap((section) => section.fields)
      for (const field of existingFields) {
        if (providedFieldKeys.has(field.key) || field.isSystem) {
          continue
        }

        if (field._count.values > 0) {
          throw new Error(
            `Cannot remove field "${field.label}" because it already contains stored values`
          )
        }

        await tx.workItemTypeFieldMapping.deleteMany({
          where: {
            workItemTypeId: typeDefinition.id,
            fieldDefinitionId: field.id,
          },
        })

        await tx.workItemFieldDefinition.delete({ where: { id: field.id } })
      }
    }

    return tx.workItemTypeDefinition.findUnique({
      where: { id: typeDefinition.id },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            fields: {
              orderBy: { order: 'asc' },
            },
          },
        },
        fields: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { issues: true },
        },
      },
    })
  })
}
