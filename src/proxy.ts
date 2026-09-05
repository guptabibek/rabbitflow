import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET
)

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  // Admin *pages* need no gate here — src/app/admin/layout.tsx re-reads the
  // role from the database and redirects. Only the API prefix is still special,
  // to keep bearer tokens away from administrative endpoints.
  const isAdminApiRoute = pathname.startsWith('/api/admin')
  const isPublicAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')
  // Covers /api/health, /api/health/live and /api/health/ready.
  const isPublicHealthRoute = pathname === '/api/health' || pathname.startsWith('/api/health/')

  // Public auth APIs, no auth required.
  if (
    isPublicHealthRoute ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/register' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/auth/mfa/verify' ||
    pathname === '/api/auth/password-reset/request' ||
    pathname === '/api/auth/password-reset/confirm'
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth-token')?.value

  // Programmatic API access presents a bearer token instead of a session cookie.
  // This gate runs on the edge runtime and cannot reach the database to validate
  // it, so the request is forwarded and `domain/auth.ts` authenticates the token
  // against ApiToken (checking hash, revocation, expiry, owner activity and
  // scope). Nothing is trusted here beyond "there is a bearer header to check".
  //
  // Restricted to /api/ so a bearer header can never stand in for a session on a
  // page route, and no x-user-id is injected, so an unauthenticated request that
  // slips past here still resolves to no identity downstream.
  const hasBearerToken = request.headers.get('authorization')?.toLowerCase().startsWith('bearer ')
  if (!token && hasBearerToken && pathname.startsWith('/api/') && !isAdminApiRoute) {
    return NextResponse.next()
  }

  if (!token) {
    if (isPublicAuthRoute) {
      return NextResponse.next()
    }

    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const { payload } = await jwtVerify(token, secret)

    if (isPublicAuthRoute) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Admin access is decided downstream, against the database, not from the
    // token's `role` claim.
    //
    // The claim is baked in at sign-in and the session lasts 30 days, so it goes
    // stale in both directions. Denying on a stale claim meant a user promoted
    // to admin was bounced from /admin until their token happened to refresh,
    // while a demoted admin was caught anyway by the authoritative checks —
    // `AdminLayout` re-reads globalRole from the database and redirects, and
    // every /api/admin route calls requireSystemAdmin, which does the same.
    //
    // Letting the request through costs nothing and makes a role change take
    // effect immediately.

    const headers = new Headers(request.headers)
    headers.set('x-user-id', payload.sub as string)
    const sessionId = (payload as { sid?: unknown }).sid
    if (typeof sessionId === 'string' && sessionId.trim()) {
      headers.set('x-session-id', sessionId)
    }
    return NextResponse.next({ request: { headers } })
  } catch {
    if (isPublicAuthRoute) {
      const response = NextResponse.next()
      response.cookies.delete('auth-token')
      return response
    }

    if (pathname.startsWith('/api/')) {
      const res = NextResponse.json({ error: 'Invalid token' }, { status: 401 })
      res.cookies.delete('auth-token')
      return res
    }
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('auth-token')
    return res
  }
}

export const config = {
  // Excludes framework assets and the handful of public branding files that must
  // load on the unauthenticated login page — `logo.svg` is the favicon, and
  // gating it made every page request 307 to /login for that asset.
  //
  // Deliberately narrow: only these exact names are exempt. `/uploads/**` stays
  // behind the gate, because those are user-supplied files that must not be
  // readable without a session.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|logo\\.svg|manifest\\.webmanifest|apple-touch-icon\\.png).*)',
  ],
}
