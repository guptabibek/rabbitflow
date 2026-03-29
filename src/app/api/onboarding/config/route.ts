import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireOnboardingManager } from '@/lib/domain/onboarding-access'
import { seedOnboardingSteps } from '@/lib/domain/onboarding-engine'
import { COMPLETION_RULE_DESCRIPTIONS } from '@/lib/domain/onboarding-steps'

const stepConfigSchema = z.object({
  key: z.string().trim().min(1).max(100).regex(/^[a-z0-9_]+$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().max(50).nullable().optional(),
  targetRoute: z.string().trim().max(200).nullable().optional(),
  ctaLabel: z.string().trim().max(100).nullable().optional(),
  ctaRoute: z.string().trim().max(200).nullable().optional(),
  completionRule: z.string().trim().min(1).max(100),
  roles: z.array(z.enum(['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer'])).default([]),
  isEnabled: z.boolean().default(true),
  order: z.number().int().min(0).max(9999).default(0),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireOnboardingManager(request, projectId)
    if (!auth.ok) return auth.response

    // Seed defaults if none exist yet
    await seedOnboardingSteps(projectId)

    const configs = await db.onboardingStepConfig.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    })

    return NextResponse.json({
      steps: configs,
      availableRules: COMPLETION_RULE_DESCRIPTIONS,
    })
  } catch (error) {
    console.error('Error fetching onboarding config:', error)
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, steps } = z
      .object({
        projectId: z.string().trim().min(1),
        steps: z.array(stepConfigSchema),
      })
      .parse(body)

    const auth = await requireOnboardingManager(request, projectId)
    if (!auth.ok) return auth.response

    // Validate unique keys
    const keys = steps.map((s) => s.key)
    if (new Set(keys).size !== keys.length) {
      return NextResponse.json({ error: 'Step keys must be unique' }, { status: 400 })
    }

    // Upsert all steps within a transaction
    await db.$transaction(async (tx) => {
      // Remove steps not in the new config
      await tx.onboardingStepConfig.deleteMany({
        where: { projectId, key: { notIn: keys } },
      })

      for (const step of steps) {
        await tx.onboardingStepConfig.upsert({
          where: { projectId_key: { projectId, key: step.key } },
          update: {
            title: step.title,
            description: step.description ?? null,
            icon: step.icon ?? null,
            targetRoute: step.targetRoute ?? null,
            ctaLabel: step.ctaLabel ?? null,
            ctaRoute: step.ctaRoute ?? null,
            completionRule: step.completionRule,
            roles: step.roles,
            isEnabled: step.isEnabled,
            order: step.order,
          },
          create: {
            projectId,
            key: step.key,
            title: step.title,
            description: step.description ?? null,
            icon: step.icon ?? null,
            targetRoute: step.targetRoute ?? null,
            ctaLabel: step.ctaLabel ?? null,
            ctaRoute: step.ctaRoute ?? null,
            completionRule: step.completionRule,
            roles: step.roles,
            isEnabled: step.isEnabled,
            order: step.order,
          },
        })
      }
    })

    const updated = await db.onboardingStepConfig.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    })

    return NextResponse.json({ steps: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid config', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error updating onboarding config:', error)
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}
