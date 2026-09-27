/**
 * The two claims every session token must carry.
 *
 * `signToken` mints a token only for an `AuthSession` row and stamps that row's
 * id into `sid`, so a token without one was never issued by this app: it can
 * only have been signed by someone holding `JWT_SECRET`. Such tokens used to be
 * accepted, and because they named no session the session check was skipped
 * for them entirely — no revocation, no sign-out, and no MFA, which is enforced
 * when a session is created. A leaked or default signing key was therefore a
 * way to act as any user, administrators included.
 *
 * Free of dependencies so the proxy can share it with the route guards.
 */
export type SessionClaims = {
  userId: string
  sessionId: string
}

export function readSessionClaims(payload: { sub?: unknown; sid?: unknown }): SessionClaims | null {
  const { sub, sid } = payload
  if (typeof sub !== 'string' || !sub.trim()) return null
  if (typeof sid !== 'string' || !sid.trim()) return null
  return { userId: sub, sessionId: sid }
}
