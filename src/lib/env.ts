/**
 * Startup environment validation.
 *
 * `JWT_SECRET` in particular used to fail silently: `new TextEncoder().encode(undefined)`
 * yields an empty key rather than throwing, so a misconfigured deployment would
 * boot and only fail later, per-request, in a way that looked like a token bug.
 * Configuration errors should stop the process at start, not degrade it in
 * production.
 */

export type EnvIssue = { variable: string; message: string }

const MIN_JWT_SECRET_BYTES = 32

function isProduction() {
  return process.env.NODE_ENV === 'production'
}

/**
 * Collect configuration problems. Returns an empty array when the environment is
 * usable. Kept pure (no `process.exit`) so it is testable.
 */
export function collectEnvIssues(env: NodeJS.ProcessEnv = process.env): EnvIssue[] {
  const issues: EnvIssue[] = []

  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    issues.push({ variable: 'DATABASE_URL', message: 'is required' })
  } else if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    issues.push({
      variable: 'DATABASE_URL',
      message: 'must be a postgresql:// connection string',
    })
  }

  const jwtSecret = env.JWT_SECRET ?? ''
  if (!jwtSecret.trim()) {
    issues.push({ variable: 'JWT_SECRET', message: 'is required' })
  } else if (Buffer.byteLength(jwtSecret, 'utf8') < MIN_JWT_SECRET_BYTES) {
    issues.push({
      variable: 'JWT_SECRET',
      message: `must be at least ${MIN_JWT_SECRET_BYTES} bytes (generate with: openssl rand -base64 48)`,
    })
  }

  if (isProduction()) {
    if (!env.CRON_SECRET?.trim()) {
      issues.push({
        variable: 'CRON_SECRET',
        message:
          'is required in production — without it SLA breach detection and recurring tasks never run',
      })
    }

    if (!env.APP_URL?.trim() && !env.NEXT_PUBLIC_APP_URL?.trim()) {
      issues.push({
        variable: 'APP_URL',
        message: 'is required in production so notification emails contain working links',
      })
    }

    if (env.ALLOW_HEADER_AUTH === 'true') {
      issues.push({
        variable: 'ALLOW_HEADER_AUTH',
        message: 'must never be enabled in production — it accepts an x-user-id header as identity',
      })
    }

    if (env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false') {
      issues.push({
        variable: 'SMTP_TLS_REJECT_UNAUTHORIZED',
        message: 'must not be false in production — it disables TLS certificate verification',
      })
    }
  }

  return issues
}

let validated = false

/**
 * Validate once per process. Throws in production so the container fails its
 * healthcheck and stops rolling out; warns loudly in development so local work
 * is not blocked.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (validated) return
  validated = true

  const issues = collectEnvIssues(env)
  if (issues.length === 0) return

  const report = issues.map((issue) => `  - ${issue.variable} ${issue.message}`).join('\n')
  const message = `Invalid environment configuration:\n${report}\n\nSee .env.example for the full contract.`

  if (isProduction()) {
    throw new Error(message)
  }

  console.warn(`WARNING: ${message}`)
}
