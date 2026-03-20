import { Prisma } from '@prisma/client'

export function toPrismaJsonValue(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return Prisma.JsonNull
  }

  return value as Prisma.InputJsonValue
}
