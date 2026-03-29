import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, getExpiredAuthCookieOptions, verifyToken } from '@/lib/auth'
import { revokeAuthSession } from '@/lib/auth-session'

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value
  if (token) {
    try {
      const payload = await verifyToken(token)
      const sessionId = (payload as { sid?: unknown }).sid
      if (typeof sessionId === 'string' && sessionId.trim()) {
        await revokeAuthSession(sessionId, 'USER_LOGOUT')
      }
    } catch {
      // Ignore invalid/expired token cleanup failures.
    }
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(AUTH_COOKIE, '', getExpiredAuthCookieOptions(request))
  return response
}
