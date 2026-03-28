import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, isUniqueConstraintError } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { DEFAULT_PROJECT_BRANDING, mergeProjectBranding } from '@/lib/domain/project-branding'

const brandingSchema = z.object({
  organizationName: z.string().trim().max(120).nullable().optional(),
  productName: z.string().trim().max(120).nullable().optional(),
  logoUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  faviconUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  accentColor: z.string().trim().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  supportEmail: z.string().trim().email().nullable().optional().or(z.literal('')),
  supportUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  helpCenterUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  customDomain: z.string().trim().max(255).nullable().optional(),
  loginHeadline: z.string().trim().max(160).nullable().optional(),
  loginSubcopy: z.string().trim().max(280).nullable().optional(),
})

function normalizeOptionalString(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeCustomDomain(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value)
  return normalized ? normalized.toLowerCase() : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId: id } = await params
    const auth = await requireProjectPermission(request, id, 'project:read')
    if (!auth.ok) return auth.response

    const branding = await db.projectBranding.findUnique({ where: { projectId: id } })

    return NextResponse.json(mergeProjectBranding(branding ?? DEFAULT_PROJECT_BRANDING))
  } catch (error) {
    console.error('Error fetching project branding:', error)
    return NextResponse.json({ error: 'Failed to fetch branding' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId: id } = await params
    const auth = await requireProjectPermission(request, id, 'branding:manage')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = brandingSchema.parse(body)

    const branding = await db.projectBranding.upsert({
      where: { projectId: id },
      update: {
        organizationName: normalizeOptionalString(data.organizationName),
        productName: normalizeOptionalString(data.productName),
        logoUrl: normalizeOptionalString(data.logoUrl),
        faviconUrl: normalizeOptionalString(data.faviconUrl),
        accentColor: data.accentColor ?? DEFAULT_PROJECT_BRANDING.accentColor,
        supportEmail: normalizeOptionalString(data.supportEmail),
        supportUrl: normalizeOptionalString(data.supportUrl),
        helpCenterUrl: normalizeOptionalString(data.helpCenterUrl),
        customDomain: normalizeCustomDomain(data.customDomain),
        loginHeadline: normalizeOptionalString(data.loginHeadline),
        loginSubcopy: normalizeOptionalString(data.loginSubcopy),
      },
      create: {
        projectId: id,
        organizationName: normalizeOptionalString(data.organizationName),
        productName: normalizeOptionalString(data.productName),
        logoUrl: normalizeOptionalString(data.logoUrl),
        faviconUrl: normalizeOptionalString(data.faviconUrl),
        accentColor: data.accentColor ?? DEFAULT_PROJECT_BRANDING.accentColor,
        supportEmail: normalizeOptionalString(data.supportEmail),
        supportUrl: normalizeOptionalString(data.supportUrl),
        helpCenterUrl: normalizeOptionalString(data.helpCenterUrl),
        customDomain: normalizeCustomDomain(data.customDomain),
        loginHeadline: normalizeOptionalString(data.loginHeadline),
        loginSubcopy: normalizeOptionalString(data.loginSubcopy),
      },
    })

    return NextResponse.json(mergeProjectBranding(branding))
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid branding payload', details: error.issues }, { status: 400 })
    }
    if (isUniqueConstraintError(error, ['customDomain'])) {
      return NextResponse.json({ error: 'This custom domain is already assigned to another project' }, { status: 409 })
    }
    console.error('Error saving project branding:', error)
    return NextResponse.json({ error: 'Failed to save branding' }, { status: 500 })
  }
}