const SCHEDULED_JOB_PATHS = new Set([
  '/api/cron',
  '/api/recurring-tasks/execute',
  '/api/sla-timers/check-breaches',
])

export function isScheduledJobRoute(pathname: string): boolean {
  return SCHEDULED_JOB_PATHS.has(pathname)
}
