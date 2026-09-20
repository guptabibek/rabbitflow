export type PortfolioHealthInput = {
  totalWork: number
  openWork: number
  overdueWork: number
  blockedWork: number
}

export type PortfolioHealth = {
  state: 'no_data' | 'healthy' | 'watch' | 'at_risk'
  label: string
  score: number | null
  signals: {
    openWork: number
    overdueWork: number
    blockedWork: number
    overduePercent: number
    blockedPercent: number
  }
}

/**
 * A deliberately small and explainable delivery-health model.
 *
 * Only open work can create current delivery risk. Overdue work contributes up
 * to 60 points of risk and blocked work contributes up to 40. A project with no
 * work is reported as no-data rather than receiving a misleading perfect score.
 */
export function calculatePortfolioHealth(input: PortfolioHealthInput): PortfolioHealth {
  const openWork = Math.max(0, input.openWork)
  const totalWork = Math.max(0, input.totalWork)
  const overdueWork = Math.min(openWork, Math.max(0, input.overdueWork))
  const blockedWork = Math.min(openWork, Math.max(0, input.blockedWork))

  if (totalWork === 0) {
    return {
      state: 'no_data',
      label: 'No delivery data',
      score: null,
      signals: { openWork, overdueWork, blockedWork, overduePercent: 0, blockedPercent: 0 },
    }
  }

  const denominator = Math.max(1, openWork)
  const overduePercent = Math.round((overdueWork / denominator) * 100)
  const blockedPercent = Math.round((blockedWork / denominator) * 100)
  const risk = Math.min(60, overduePercent * 0.6) + Math.min(40, blockedPercent * 0.4)
  const score = Math.max(0, Math.round(100 - risk))
  const state = score >= 85 ? 'healthy' : score >= 65 ? 'watch' : 'at_risk'

  return {
    state,
    label: state === 'healthy' ? 'Healthy' : state === 'watch' ? 'Needs attention' : 'At risk',
    score,
    signals: { openWork, overdueWork, blockedWork, overduePercent, blockedPercent },
  }
}

export const PORTFOLIO_HEALTH_EXPLANATION =
  'Health starts at 100. Overdue open work contributes up to 60 risk points and blocked open work contributes up to 40. Healthy is 85–100, Needs attention is 65–84, and At risk is below 65.'
