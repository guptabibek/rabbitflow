import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const CONNECTION_LIMIT = parseInt(process.env.DATABASE_CONNECTION_LIMIT || '10', 10)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
    datasourceUrl: appendConnectionLimit(process.env.DATABASE_URL),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

function appendConnectionLimit(url: string | undefined): string | undefined {
  if (!url) return url
  const separator = url.includes('?') ? '&' : '?'
  if (url.includes('connection_limit=')) return url
  return `${url}${separator}connection_limit=${CONNECTION_LIMIT}`
}
