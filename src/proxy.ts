import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET
)

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAdminPageRoute = pathname === '/admin' || pathname.startsWith('/admin/')
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
    const role = (payload as { role?: unknown }).role

    if (isPublicAuthRoute) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if ((isAdminPageRoute || isAdminApiRoute) && role === 'member') {
      if (isAdminApiRoute) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

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
