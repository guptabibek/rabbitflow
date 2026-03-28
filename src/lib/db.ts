import { Prisma, PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const CONNECTION_LIMIT = parseInt(process.env.DATABASE_CONNECTION_LIMIT || '10', 10)
const TRANSIENT_DB_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024', 'P2034'])

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
    datasourceUrl: appendConnectionLimit(process.env.DATABASE_URL),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : null
  }

  return null
}

export function isTransientDbError(error: unknown) {
  const code = getErrorCode(error)
  if (code && TRANSIENT_DB_CODES.has(code)) {
    return true
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return true
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return [
      'can\'t reach database server',
      'connection',
      'timed out',
      'server has closed the connection',
      'too many connections',
      'transaction failed due to a write conflict',
    ].some((fragment) => message.includes(fragment))
  }

  return false
}

export function isUniqueConstraintError(error: unknown, targetFields?: string[]) {
  if (getErrorCode(error) !== 'P2002') {
    return false
  }

  if (!targetFields || targetFields.length === 0) {
    return true
  }

  if (typeof error !== 'object' || error === null || !('meta' in error)) {
    return true
  }

  const metaTarget = (error as { meta?: { target?: unknown } }).meta?.target
  const normalizedTargets = Array.isArray(metaTarget)
    ? metaTarget.filter((value): value is string => typeof value === 'string')
    : typeof metaTarget === 'string'
      ? [metaTarget]
      : []

  if (normalizedTargets.length === 0) {
    return true
  }

  return targetFields.every((field) => normalizedTargets.includes(field))
}

type DbRetryOptions = {
  attempts?: number
  retryDelayMs?: number
}

export async function runWithDbRetry<T>(
  operation: () => Promise<T>,
  options: DbRetryOptions = {}
): Promise<T> {
  const attempts = Math.max(options.attempts ?? 3, 1)
  const retryDelayMs = Math.max(options.retryDelayMs ?? 150, 0)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (attempt >= attempts || !isTransientDbError(error)) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Database operation failed')
}

function appendConnectionLimit(url: string | undefined): string | undefined {
  if (!url) return url
  const separator = url.includes('?') ? '&' : '?'
  if (url.includes('connection_limit=')) return url
  return `${url}${separator}connection_limit=${CONNECTION_LIMIT}`
}
