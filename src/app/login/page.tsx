import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { LoginExperience } from '@/components/auth/login-experience'
import { AUTH_COOKIE } from '@/lib/auth'
import { getAuthenticatedUserFromToken } from '@/lib/domain/auth'
import { getPublicAuthBranding } from '@/lib/domain/public-branding'

async function getRequestBranding() {
  const requestHeaders = await headers()
  return getPublicAuthBranding(requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'))
}

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getRequestBranding()
  return {
    title: `Sign In - ${branding.displayName}`,
    description:
      branding.loginSubcopy || `Secure access to ${branding.displayName} across planning, delivery, and reporting.`,
    icons: branding.faviconUrl ? { icon: branding.faviconUrl } : undefined,
  }
}

export default async function LoginPage() {
  const [branding, cookieStore] = await Promise.all([getRequestBranding(), cookies()])
  const token = cookieStore.get(AUTH_COOKIE)?.value

  if (token) {
    const user = await getAuthenticatedUserFromToken(token)
    if (user) {
      redirect('/dashboard')
    }
  }

  return <LoginExperience branding={branding} />
}
