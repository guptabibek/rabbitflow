import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { LoginExperience } from '@/components/auth/login-experience'
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
  const branding = await getRequestBranding()
  return <LoginExperience branding={branding} />
}
