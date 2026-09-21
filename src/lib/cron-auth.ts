import { secretsMatch } from '@/lib/auth-otp'

type HeaderSource = {
  headers: {
    get(name: string): string | null
  }
}

/**
 * Authenticate a scheduled-job request against the current process environment.
 *
 * Keeping this check in one place ensures every scheduled endpoint fails closed
 * and reads the runtime value consistently.
 */
export function getAuthorizedCronSecret(request: HeaderSource): string | null {
  const expected = process.env.CRON_SECRET
  const provided = request.headers.get('x-cron-secret')

  if (!expected || !provided || !secretsMatch(expected, provided)) {
    return null
  }

  return expected
}
