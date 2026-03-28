'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getApiErrorMessage } from '@/lib/utils'

type BrandingState = {
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

const EMPTY_BRANDING: BrandingState = {
  organizationName: '',
  productName: '',
  logoUrl: '',
  faviconUrl: '',
  accentColor: '#22c55e',
  supportEmail: '',
  supportUrl: '',
  helpCenterUrl: '',
  customDomain: '',
  loginHeadline: '',
  loginSubcopy: '',
}

export function BrandingStudio() {
  const currentProject = useAppStore((state) => state.currentProject)
  const currentProjectPermissions = useAppStore((state) => state.currentProjectPermissions)
  const [branding, setBranding] = useState<BrandingState>(EMPTY_BRANDING)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const canManage = currentProjectPermissions.includes('branding:manage')

  useEffect(() => {
    if (!currentProject) return

    let cancelled = false
    setLoading(true)

    fetch(`/api/projects/${currentProject.id}/branding`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, 'Failed to load branding'))
        }
        return response.json()
      })
      .then((payload) => {
        if (!cancelled) {
          setBranding({ ...EMPTY_BRANDING, ...payload })
          setLoadError(null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBranding(EMPTY_BRANDING)
          setLoadError(error instanceof Error ? error.message : 'Failed to load branding')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentProject])

  if (!currentProject) return null

  const saveBranding = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${currentProject.id}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      })

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to save branding'))
      }

      setBranding({ ...EMPTY_BRANDING, ...(await response.json()) })
      toast.success('Branding updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save branding')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>White-Label Branding</CardTitle>
          <p className="text-sm text-muted-foreground">Project-specific product identity, support surfaces, and login copy.</p>
          {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Organization name</Label><Input disabled={!canManage || loading} value={branding.organizationName ?? ''} onChange={(event) => setBranding((state) => ({ ...state, organizationName: event.target.value }))} /></div>
          <div className="space-y-2"><Label>Product name</Label><Input disabled={!canManage || loading} value={branding.productName ?? ''} onChange={(event) => setBranding((state) => ({ ...state, productName: event.target.value }))} /></div>
          <div className="space-y-2"><Label>Logo URL</Label><Input disabled={!canManage || loading} value={branding.logoUrl ?? ''} onChange={(event) => setBranding((state) => ({ ...state, logoUrl: event.target.value }))} /></div>
          <div className="space-y-2"><Label>Accent color</Label><Input disabled={!canManage || loading} value={branding.accentColor} onChange={(event) => setBranding((state) => ({ ...state, accentColor: event.target.value }))} /></div>
          <div className="space-y-2"><Label>Support email</Label><Input disabled={!canManage || loading} value={branding.supportEmail ?? ''} onChange={(event) => setBranding((state) => ({ ...state, supportEmail: event.target.value }))} /></div>
          <div className="space-y-2"><Label>Support URL</Label><Input disabled={!canManage || loading} value={branding.supportUrl ?? ''} onChange={(event) => setBranding((state) => ({ ...state, supportUrl: event.target.value }))} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Custom domain</Label><Input disabled={!canManage || loading} value={branding.customDomain ?? ''} onChange={(event) => setBranding((state) => ({ ...state, customDomain: event.target.value }))} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Login headline</Label><Input disabled={!canManage || loading} value={branding.loginHeadline ?? ''} onChange={(event) => setBranding((state) => ({ ...state, loginHeadline: event.target.value }))} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Login subcopy</Label><Textarea disabled={!canManage || loading} value={branding.loginSubcopy ?? ''} onChange={(event) => setBranding((state) => ({ ...state, loginSubcopy: event.target.value }))} rows={4} /></div>
          {canManage ? <Button onClick={() => void saveBranding()} disabled={saving}>{saving ? 'Saving…' : 'Save Branding'}</Button> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-xl" style={{ borderTopColor: branding.accentColor, borderTopWidth: 4 }}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: branding.accentColor }}>
                {(branding.productName || currentProject.key).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-lg font-semibold">{branding.productName || currentProject.name}</div>
                <div className="text-sm text-muted-foreground">{branding.organizationName || 'Enterprise workspace branding'}</div>
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-muted/50 p-4">
              <div className="text-sm font-medium">{branding.loginHeadline || 'Welcome back'}</div>
              <p className="mt-2 text-sm text-muted-foreground">{branding.loginSubcopy || 'Your support, onboarding, and identity touchpoints render from this project branding profile.'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}