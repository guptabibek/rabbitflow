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
  const registrationEnabled = process.env.ALLOW_SELF_REGISTRATION === 'true'
  return {
    title: registrationEnabled
      ? `Register - ${branding.displayName}`
      : `Account Access - ${branding.displayName}`,
    description: registrationEnabled
      ? `Create your ${branding.displayName} account and continue into the workspace.`
      : `Contact your administrator for access to ${branding.displayName}.`,
    ...(branding.faviconUrl ? { icons: { icon: branding.faviconUrl } } : {}),
  }
}

export default async function RegisterPage() {
  const branding = await getRequestBranding()
  return (
    <RegisterExperience
      branding={branding}
      registrationEnabled={process.env.ALLOW_SELF_REGISTRATION === 'true'}
    />
  )
}
