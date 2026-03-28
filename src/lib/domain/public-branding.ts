import { cache } from 'react'
import { db } from '@/lib/db'
import { toResolvedBranding, type ResolvedProjectBranding } from '@/lib/domain/project-branding'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function normalizeHost(value: string | null | undefined) {
  if (!value) return null
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
}

function getConfiguredHosts() {
  return [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]
    .map((value) => {
      if (!value) return null
      try {
        return normalizeHost(new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`).host)
      } catch {
        return normalizeHost(value)
      }
    })
    .filter((value): value is string => Boolean(value))
}

function getHostCandidates(host: string | null) {
  if (!host) return []
  if (host.startsWith('www.')) {
    return [host, host.slice(4)]
  }
  return [host, `www.${host}`]
}

async function getFallbackBranding() {
  return db.projectBranding.findFirst({
    where: {
      OR: [
        { organizationName: { not: null } },
        { productName: { not: null } },
        { logoUrl: { not: null } },
        { faviconUrl: { not: null } },
        { supportEmail: { not: null } },
        { supportUrl: { not: null } },
        { helpCenterUrl: { not: null } },
        { loginHeadline: { not: null } },
        { loginSubcopy: { not: null } },
      ],
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  })
}

export const getPublicAuthBranding = cache(
  async (hostHeader?: string | null): Promise<ResolvedProjectBranding> => {
    const host = normalizeHost(hostHeader)
    const customDomainCandidates = getHostCandidates(host)

    if (customDomainCandidates.length > 0) {
      const domainBranding = await db.projectBranding.findFirst({
        where: {
          OR: customDomainCandidates.map((candidate) => ({
            customDomain: { equals: candidate, mode: 'insensitive' as const },
          })),
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      })

      if (domainBranding) {
        return toResolvedBranding(domainBranding)
      }
    }

    const configuredHosts = new Set(getConfiguredHosts())
    const canUseFallbackBranding = !host || LOCAL_HOSTS.has(host) || configuredHosts.has(host)

    if (!canUseFallbackBranding) {
      return toResolvedBranding(null)
    }

    return toResolvedBranding(await getFallbackBranding())
  }
)