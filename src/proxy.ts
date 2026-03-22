import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET
)

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAdminPageRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const isAdminApiRoute = pathname.startsWith('/api/admin')

  // Public paths, no auth required.
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
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

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const { payload } = await jwtVerify(token, secret)
    const role = (payload as { role?: unknown }).role

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
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt).*)'],
}
