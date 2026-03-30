import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { ensureProjectSystemRecordsTx } from '../src/lib/domain/project-system-records.ts'
import { buildOnboardingStepSeedData } from '../src/lib/domain/onboarding-seed.ts'

const db = new PrismaClient()

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required for bootstrap seeding`)
  }
  return value
}

function optionalEnv(name, fallback = '') {
  return process.env[name]?.trim() || fallback
}

function booleanEnv(name, fallback) {
  const rawValue = process.env[name]?.trim().toLowerCase()
  if (!rawValue) {
    return fallback
  }

  return rawValue === '1' || rawValue === 'true' || rawValue === 'yes'
}

function normalizeProjectKey(value) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (normalized.length < 2 || normalized.length > 10) {
    throw new Error('SEED_PROJECT_KEY must resolve to 2-10 uppercase letters')
  }
  return normalized
}

async function ensureBootstrapProject(adminUserId) {
  const shouldCreateProject = booleanEnv('SEED_CREATE_PROJECT', true)
  if (!shouldCreateProject) {
    console.log('Bootstrap project creation is disabled.')
    return
  }

  const projectKey = normalizeProjectKey(optionalEnv('SEED_PROJECT_KEY', 'RABBIT'))
  const projectName = optionalEnv('SEED_PROJECT_NAME', 'RabbitFlow')
  const projectDescription = optionalEnv(
    'SEED_PROJECT_DESCRIPTION',
    'Starter project provisioned during first-deploy bootstrap.'
  )
  const projectColor = optionalEnv('SEED_PROJECT_COLOR', '#1d4ed8')
  const projectIcon = optionalEnv('SEED_PROJECT_ICON', 'Layers3')

  const project = await db.$transaction(async (tx) => {
    const existingProject = await tx.project.findUnique({
      where: { key: projectKey },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        icon: true,
      },
    })

    const projectId = existingProject
      ? existingProject.id
      : (
          await tx.project.create({
            data: {
              key: projectKey,
              name: projectName,
              description: projectDescription,
              color: projectColor,
              icon: projectIcon,
            },
            select: { id: true },
          })
        ).id

    if (existingProject) {
      const projectUpdates = {}

      if (existingProject.name !== projectName) {
        projectUpdates.name = projectName
      }

      if ((existingProject.description ?? '') !== projectDescription) {
        projectUpdates.description = projectDescription
      }

      if (existingProject.color !== projectColor) {
        projectUpdates.color = projectColor
      }

      if ((existingProject.icon ?? '') !== projectIcon) {
        projectUpdates.icon = projectIcon
      }

      if (Object.keys(projectUpdates).length > 0) {
        await tx.project.update({
          where: { id: projectId },
          data: projectUpdates,
        })
      }
    }

    const existingMembership = await tx.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: adminUserId,
        },
      },
      select: { id: true, role: true },
    })

    if (!existingMembership) {
      await tx.projectMember.create({
        data: {
          projectId,
          userId: adminUserId,
          role: 'Admin',
        },
      })
    } else if (existingMembership.role !== 'Admin') {
      await tx.projectMember.update({
        where: { id: existingMembership.id },
        data: { role: 'Admin' },
      })
    }

    await ensureProjectSystemRecordsTx(tx, projectId, adminUserId)

    const onboardingStepCount = await tx.onboardingStepConfig.count({
      where: { projectId },
    })

    if (onboardingStepCount === 0) {
      await tx.onboardingStepConfig.createMany({
        data: buildOnboardingStepSeedData(projectId),
      })
    }

    return tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, key: true, name: true },
    })
  })

  console.log(`Bootstrap project is ready: ${project.key} (${project.name})`)
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

  let adminUserId = existing?.id ?? null

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

    adminUserId = created.id
    console.log(`Created bootstrap admin user: ${created.email}`)
  } else {
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

    adminUserId = existing.id
    console.log(`Bootstrap admin user is ready: ${email}`)
  }

  if (!adminUserId) {
    throw new Error('Bootstrap admin user could not be resolved')
  }

  await ensureBootstrapProject(adminUserId)
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
