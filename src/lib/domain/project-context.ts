import { NextRequest, NextResponse } from 'next/server'

export const ACTIVE_PROJECT_COOKIE = 'active-project-id'

const ACTIVE_PROJECT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
}

export function getActiveProjectId(request: NextRequest): string | null {
  return request.cookies.get(ACTIVE_PROJECT_COOKIE)?.value ?? null
}

export function setActiveProjectCookie(
  response: NextResponse,
  projectId: string | null
) {
  if (!projectId) {
    response.cookies.delete(ACTIVE_PROJECT_COOKIE)
    return
  }

  response.cookies.set(
    ACTIVE_PROJECT_COOKIE,
    projectId,
    ACTIVE_PROJECT_COOKIE_OPTIONS
  )
}
