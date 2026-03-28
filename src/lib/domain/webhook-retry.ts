// Pure webhook retry helpers extracted for testability.

export const WEBHOOK_MAX_ATTEMPTS = 4
export const WEBHOOK_BACKOFF_MS = [0, 1000, 3000, 10000]

export type WebhookRetryAttempt = {
  attempt: number
  delayMs: number
}

export function buildWebhookRetryPlan(
  maxAttempts = WEBHOOK_MAX_ATTEMPTS,
  backoffMs = WEBHOOK_BACKOFF_MS
): WebhookRetryAttempt[] {
  const lastDelay = backoffMs[backoffMs.length - 1] ?? 0
  return Array.from({ length: Math.max(maxAttempts, 0) }, (_, index) => ({
    attempt: index + 1,
    delayMs: index === 0 ? 0 : (backoffMs[index] ?? lastDelay),
  }))
}