import { DEFAULT_ONBOARDING_STEPS } from './onboarding-steps.ts'

export function buildOnboardingStepSeedData(projectId: string) {
  return DEFAULT_ONBOARDING_STEPS.map((step) => ({
    projectId,
    key: step.key,
    title: step.title,
    description: step.description,
    icon: step.icon,
    targetRoute: step.targetRoute,
    ctaLabel: step.ctaLabel,
    ctaRoute: step.ctaRoute,
    completionRule: step.completionRule,
    roles: step.roles,
    isEnabled: true,
    order: step.order,
  }))
}