export type ProjectBrandingPayload = {
  organizationName: string | null
  productName: string | null
  logoUrl: string | null
  faviconUrl: string | null
  accentColor: string
  supportEmail: string | null
  supportUrl: string | null
  helpCenterUrl: string | null
  customDomain: string | null
  loginHeadline: string | null
  loginSubcopy: string | null
}

export type ResolvedProjectBranding = ProjectBrandingPayload & {
  displayName: string
}

export const DEFAULT_PROJECT_BRANDING: ProjectBrandingPayload = {
  organizationName: null,
  productName: null,
  logoUrl: null,
  faviconUrl: null,
  accentColor: '#22c55e',
  supportEmail: null,
  supportUrl: null,
  helpCenterUrl: null,
  customDomain: null,
  loginHeadline: null,
  loginSubcopy: null,
}

export function mergeProjectBranding<T extends Partial<ProjectBrandingPayload>>(
  branding: T | null | undefined
) {
  return {
    ...DEFAULT_PROJECT_BRANDING,
    ...(branding ?? {}),
  }
}

export function getBrandDisplayName(
  branding: Partial<ProjectBrandingPayload> | null | undefined,
  fallback = 'RabbitFlow'
) {
  return branding?.productName || branding?.organizationName || fallback
}

export function toResolvedBranding<T extends Partial<ProjectBrandingPayload>>(
  branding: T | null | undefined
): ResolvedProjectBranding {
  const merged = mergeProjectBranding(branding)
  return {
    ...merged,
    displayName: getBrandDisplayName(merged),
  }
}