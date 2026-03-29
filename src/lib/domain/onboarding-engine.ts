/**
 * Onboarding Evaluation Engine
 *
 * Dynamically evaluates which onboarding steps a user has completed
 * based on real data (not hardcoded). Each `completionRule` maps to
 * a resolver that queries the database.
 *
 * Design:
 * - Batch-queries data once per evaluation call (not per-step)
 * - Caches per-request via the context object
 * - Supports event-based steps (view tracking) via OnboardingState
 */

import { type Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { DEFAULT_ONBOARDING_STEPS, type OnboardingRole } from './onboarding-steps'
import { buildOnboardingStepSeedData } from './onboarding-seed.ts'

// ── Types ──────────────────────────────────────────────────────

export type EvaluatedStep = {
  key: string
  title: string
  description: string
  icon: string
  targetRoute: string | null
  ctaLabel: string
  ctaRoute: string | null
  completionRule: string
  order: number
  isCompleted: boolean
  isDismissed: boolean
}

export type OnboardingStatus = {
  steps: EvaluatedStep[]
  completedCount: number
  totalCount: number
  progressPercent: number
  isDismissed: boolean
  currentStep: string | null
  completedAt: string | null
}

// ── Data context fetched once per evaluation ───────────────────

type EvalContext = {
  projectId: string
  userId: string
  memberCount: number
  issueCount: number
  assignedIssueCount: number
  completedIssueCount: number
  iterationCount: number
  teamCount: number
  labelCount: number
  eventSteps: string[]  // steps completed by tracked events (e.g. "viewed_board")
}

async function buildEvalContext(
  projectId: string,
  userId: string,
  completedSteps: string[]
): Promise<EvalContext> {
  const [
    memberCount,
    issueCount,
    assignedIssueCount,
    completedIssueCount,
    iterationCount,
    teamCount,
    labelCount,
  ] = await Promise.all([
    db.projectMember.count({ where: { projectId } }),
    db.issue.count({ where: { projectId } }),
    db.issue.count({ where: { projectId, assigneeId: { not: null } } }),
    db.issue.count({
      where: {
        projectId,
        stateRecord: { isFinal: true },
      },
    }),
    db.iteration.count({ where: { projectId } }),
    db.team.count({ where: { projectId } }),
    db.label.count({ where: { projectId } }),
  ])

  return {
    projectId,
    userId,
    memberCount,
    issueCount,
    assignedIssueCount,
    completedIssueCount,
    iterationCount,
    teamCount,
    labelCount,
    eventSteps: completedSteps,
  }
}

// ── Completion rule resolvers ──────────────────────────────────

type RuleResolver = (ctx: EvalContext) => boolean

const RULE_RESOLVERS: Record<string, RuleResolver> = {
  has_project: () => true, // If we're evaluating in a project context, the user has a project
  has_team_member: (ctx) => ctx.memberCount > 1,
  has_issue: (ctx) => ctx.issueCount > 0,
  viewed_board: (ctx) => ctx.eventSteps.includes('viewed_board'),
  has_sprint: (ctx) => ctx.iterationCount > 0,
  has_assigned_issue: (ctx) => ctx.assignedIssueCount > 0,
  has_team: (ctx) => ctx.teamCount > 0,
  has_label: (ctx) => ctx.labelCount > 0,
  has_completed_issue: (ctx) => ctx.completedIssueCount > 0,
  viewed_reports: (ctx) => ctx.eventSteps.includes('viewed_reports'),
}

function evaluateRule(rule: string, ctx: EvalContext): boolean {
  const resolver = RULE_RESOLVERS[rule]
  if (!resolver) return false
  return resolver(ctx)
}

// ── Onboarding state helpers ───────────────────────────────────

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  return []
}

async function getOrCreateOnboardingState(userId: string, projectId: string) {
  const existing = await db.onboardingState.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })

  if (existing) return existing

  return db.onboardingState.create({
    data: { userId, projectId },
  })
}

// ── Main evaluation function ───────────────────────────────────

export async function evaluateOnboardingStatus(
  userId: string,
  projectId: string,
  userRole: string | null
): Promise<OnboardingStatus> {
  // 1. Get user's onboarding state
  const state = await getOrCreateOnboardingState(userId, projectId)
  const completedSteps = parseJsonStringArray(state.completedSteps)
  const dismissedSteps = parseJsonStringArray(state.dismissedSteps)

  // 2. Get step configs (prefer project-specific, fall back to defaults)
  const dbSteps = await db.onboardingStepConfig.findMany({
    where: { projectId, isEnabled: true },
    orderBy: { order: 'asc' },
  })

  const normalizedRole = (userRole ?? 'Dev') as OnboardingRole
  const defaultStepByKey = new Map(DEFAULT_ONBOARDING_STEPS.map((step) => [step.key, step]))
  const stepConfigs = dbSteps.length > 0
    ? dbSteps
        .filter((s) => {
          const roles = parseJsonStringArray(s.roles)
          return roles.length === 0 || roles.includes(normalizedRole)
        })
        .map((s) => {
          const defaultStep = defaultStepByKey.get(s.key)

          return {
            key: s.key,
            title: s.title,
            description: s.description ?? defaultStep?.description ?? '',
            icon: s.icon ?? defaultStep?.icon ?? 'Circle',
            targetRoute: s.targetRoute ?? defaultStep?.targetRoute ?? null,
            ctaLabel: s.ctaLabel ?? defaultStep?.ctaLabel ?? 'Go',
            ctaRoute: s.ctaRoute ?? defaultStep?.ctaRoute ?? null,
            completionRule: s.completionRule,
            order: s.order,
          }
        })
    : DEFAULT_ONBOARDING_STEPS
        .filter((s) => s.roles.length === 0 || s.roles.includes(normalizedRole))
        .map((s) => ({
          key: s.key,
          title: s.title,
          description: s.description,
          icon: s.icon,
          targetRoute: s.targetRoute,
          ctaLabel: s.ctaLabel,
          ctaRoute: s.ctaRoute,
          completionRule: s.completionRule,
          order: s.order,
        }))

  // 3. Build evaluation context (batch query)
  const ctx = await buildEvalContext(projectId, userId, completedSteps)

  // 4. Evaluate each step
  const evaluatedSteps: EvaluatedStep[] = stepConfigs.map((step) => {
    const isCompletedByRule = evaluateRule(step.completionRule, ctx)
    const isCompletedByState = completedSteps.includes(step.key)

    return {
      key: step.key,
      title: step.title,
      description: step.description,
      icon: step.icon,
      targetRoute: step.targetRoute,
      ctaLabel: step.ctaLabel,
      ctaRoute: step.ctaRoute,
      completionRule: step.completionRule,
      order: step.order,
      isCompleted: isCompletedByRule || isCompletedByState,
      isDismissed: dismissedSteps.includes(step.key),
    }
  })

  const completedCount = evaluatedSteps.filter((s) => s.isCompleted).length
  const totalCount = evaluatedSteps.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100

  // 5. Determine current step (first non-completed, non-dismissed step)
  const currentStep =
    evaluatedSteps.find((s) => !s.isCompleted && !s.isDismissed)?.key ?? null

  // 6. Auto-sync: write newly-detected completions back to state
  const newlyCompleted = evaluatedSteps
    .filter((s) => s.isCompleted && !completedSteps.includes(s.key))
    .map((s) => s.key)

  if (newlyCompleted.length > 0 || state.currentStep !== currentStep) {
    const mergedCompleted = [...new Set([...completedSteps, ...newlyCompleted])]
    const isNowComplete = completedCount === totalCount && totalCount > 0

    await db.onboardingState.update({
      where: { id: state.id },
      data: {
        completedSteps: mergedCompleted,
        currentStep,
        lastSeenAt: new Date(),
        ...(isNowComplete && !state.completedAt ? { completedAt: new Date() } : {}),
      },
    })
  } else {
    // Update lastSeenAt even without changes (debounced by caller)
    await db.onboardingState.update({
      where: { id: state.id },
      data: { lastSeenAt: new Date() },
    })
  }

  return {
    steps: evaluatedSteps,
    completedCount,
    totalCount,
    progressPercent,
    isDismissed: state.isDismissed,
    currentStep,
    completedAt: state.completedAt?.toISOString() ?? null,
  }
}

// ── Event-based step completion ────────────────────────────────

export async function recordOnboardingEvent(
  userId: string,
  projectId: string,
  stepKey: string
): Promise<void> {
  const state = await getOrCreateOnboardingState(userId, projectId)
  const completedSteps = parseJsonStringArray(state.completedSteps)

  if (completedSteps.includes(stepKey)) return

  const merged = [...completedSteps, stepKey]
  await db.onboardingState.update({
    where: { id: state.id },
    data: { completedSteps: merged, lastSeenAt: new Date() },
  })

  // Track analytics
  await db.onboardingAnalytics.create({
    data: {
      projectId,
      userId,
      stepKey,
      action: 'completed',
    },
  })
}

// ── Dismiss / Skip operations ──────────────────────────────────

export async function dismissOnboardingStep(
  userId: string,
  projectId: string,
  stepKey: string
): Promise<void> {
  const state = await getOrCreateOnboardingState(userId, projectId)
  const dismissedSteps = parseJsonStringArray(state.dismissedSteps)

  if (dismissedSteps.includes(stepKey)) return

  const merged = [...dismissedSteps, stepKey]
  await db.onboardingState.update({
    where: { id: state.id },
    data: { dismissedSteps: merged, lastSeenAt: new Date() },
  })

  await db.onboardingAnalytics.create({
    data: {
      projectId,
      userId,
      stepKey,
      action: 'dismissed',
    },
  })
}

export async function dismissOnboardingChecklist(
  userId: string,
  projectId: string
): Promise<void> {
  const state = await getOrCreateOnboardingState(userId, projectId)
  await db.onboardingState.update({
    where: { id: state.id },
    data: { isDismissed: true, lastSeenAt: new Date() },
  })

  await db.onboardingAnalytics.create({
    data: {
      projectId,
      userId,
      stepKey: '__checklist__',
      action: 'dismissed_all',
    },
  })
}

export async function resetOnboardingState(
  userId: string,
  projectId: string
): Promise<void> {
  await db.onboardingState.upsert({
    where: { userId_projectId: { userId, projectId } },
    update: {
      completedSteps: [],
      dismissedSteps: [],
      currentStep: null,
      isDismissed: false,
      completedAt: null,
      lastSeenAt: new Date(),
    },
    create: {
      userId,
      projectId,
    },
  })
}

// ── Analytics queries ──────────────────────────────────────────

export async function getOnboardingAnalytics(projectId: string) {
  const [stepStats, totalUsers, completedUsers, avgCompletionTime] = await Promise.all([
    db.onboardingAnalytics.groupBy({
      by: ['stepKey', 'action'],
      where: { projectId },
      _count: { id: true },
    }),
    db.onboardingState.count({ where: { projectId } }),
    db.onboardingState.count({ where: { projectId, completedAt: { not: null } } }),
    db.onboardingState.findMany({
      where: { projectId, completedAt: { not: null } },
      select: { createdAt: true, completedAt: true },
    }),
  ])

  const avgTimeMs = avgCompletionTime.length > 0
    ? avgCompletionTime.reduce((sum, s) => {
        return sum + (s.completedAt!.getTime() - s.createdAt.getTime())
      }, 0) / avgCompletionTime.length
    : null

  return {
    stepStats: stepStats.map((s) => ({
      stepKey: s.stepKey,
      action: s.action,
      count: s._count.id,
    })),
    totalUsers,
    completedUsers,
    completionRate: totalUsers > 0 ? Math.round((completedUsers / totalUsers) * 100) : 0,
    avgCompletionTimeMs: avgTimeMs ? Math.round(avgTimeMs) : null,
  }
}

// ── Seed default steps for a project ───────────────────────────

export async function seedOnboardingSteps(projectId: string): Promise<void> {
  return db.$transaction((tx) => seedOnboardingStepsTx(tx, projectId))
}

export async function seedOnboardingStepsTx(
  tx: Prisma.TransactionClient,
  projectId: string
): Promise<void> {
  const existing = await tx.onboardingStepConfig.count({ where: { projectId } })
  if (existing > 0) return

  await tx.onboardingStepConfig.createMany({
    data: buildOnboardingStepSeedData(projectId),
  })
}
