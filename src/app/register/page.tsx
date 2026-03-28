import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { RegisterExperience } from '@/components/auth/register-experience'
import { getPublicAuthBranding } from '@/lib/domain/public-branding'

async function getRequestBranding() {
  const requestHeaders = await headers()
  return getPublicAuthBranding(requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'))
}

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getRequestBranding()
  return {
    title: `Register - ${branding.displayName}`,
    description: `Create your ${branding.displayName} account and continue into the workspace.`,
    icons: branding.faviconUrl ? { icon: branding.faviconUrl } : undefined,
  }
}

export default async function RegisterPage() {
  const branding = await getRequestBranding()
  return <RegisterExperience branding={branding} />
}
