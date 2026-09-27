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

/**
 * Secret values this repository has published, as compose defaults or README
 * examples. Being public, they are no secret at all: with the JWT one anyone
 * can sign a session token, and with the cron one anyone can trigger the
 * scheduled jobs. Several are long enough to pass the length check, so they
 * are rejected by value.
 */
const PUBLISHED_PLACEHOLDER_SECRETS: Record<'JWT_SECRET' | 'CRON_SECRET', readonly string[]> = {
  JWT_SECRET: ['replace-this-with-a-long-random-secret', 'replace-with-a-long-random-secret'],
  CRON_SECRET: ['default-cron-secret-change-me'],
}

function isPublishedPlaceholder(variable: keyof typeof PUBLISHED_PLACEHOLDER_SECRETS, value?: string) {
  return value !== undefined && PUBLISHED_PLACEHOLDER_SECRETS[variable].includes(value.trim())
}

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
  } else if (isPublishedPlaceholder('JWT_SECRET', jwtSecret)) {
    issues.push({
      variable: 'JWT_SECRET',
      message: 'is a placeholder published in this repository (generate with: openssl rand -base64 48)',
    })
  }

  if (isPublishedPlaceholder('CRON_SECRET', env.CRON_SECRET)) {
    issues.push({
      variable: 'CRON_SECRET',
      message: 'is a placeholder published in this repository (generate with: openssl rand -hex 32)',
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
