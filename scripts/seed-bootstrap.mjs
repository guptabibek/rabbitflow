import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required for bootstrap seeding`)
  }
  return value
}

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'rabbittech46@gmail.com').trim().toLowerCase()
  const name = (process.env.SEED_ADMIN_NAME || 'RabbitFlow Admin').trim()
  const password = requiredEnv('SEED_ADMIN_PASSWORD')

  const passwordHash = await bcrypt.hash(password, 12)

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, globalRole: true, passwordHash: true, name: true },
  })

  if (!existing) {
    const created = await db.user.create({
      data: {
        email,
        name,
        passwordHash,
        globalRole: 'admin',
      },
      select: { id: true, email: true },
    })

    console.log(`Created bootstrap admin user: ${created.email}`)
    return
  }

  const updateData = {}

  if (existing.globalRole !== 'admin') {
    updateData.globalRole = 'admin'
  }

  if (existing.name !== name) {
    updateData.name = name
  }

  if (!existing.passwordHash) {
    updateData.passwordHash = passwordHash
  }

  if (Object.keys(updateData).length > 0) {
    await db.user.update({
      where: { id: existing.id },
      data: updateData,
    })
  }

  console.log(`Bootstrap admin user is ready: ${email}`)
}

main()
  .catch((error) => {
    console.error('Bootstrap seed failed.')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
