'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { getApiErrorMessage } from '@/lib/utils'
import { normalizeProjectRole } from '@/lib/domain/rbac'

const GUIDE_ROLE_OPTIONS = ['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer'] as const
const GUIDE_MAX_TITLE_LENGTH = 140
const GUIDE_MAX_SUMMARY_LENGTH = 240
const GUIDE_MAX_BODY_LENGTH = 15000

type Guide = {
  id: string
  title: string
  slug: string
  audienceRole: string | null
  summary: string | null
  content: { body: string }
  isPublished: boolean
  order: number
}

type GuideDraft = {
  title: string
  slug: string
  audienceRole: string
  summary: string
  body: string
}

const EMPTY_DRAFT: GuideDraft = {
  title: '',
  slug: '',
  audienceRole: '',
  summary: '',
  body: '',
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function OnboardingGuidesView() {
  const currentProject = useAppStore((state) => state.currentProject)
  const currentProjectRole = useAppStore((state) => state.currentProjectRole)
  const [guides, setGuides] = useState<Guide[]>([])
  const [draft, setDraft] = useState<GuideDraft>(EMPTY_DRAFT)
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const canManage = normalizeProjectRole(currentProjectRole) === 'Admin'

  const fetchGuides = () => {
    if (!currentProject) return
    setLoading(true)
    fetch(`/api/onboarding-guides?projectId=${currentProject.id}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, 'Failed to load onboarding guides'))
        }
        return response.json()
      })
      .then((payload) => {
        setGuides(payload ?? [])
        setLoadError(null)
      })
      .catch((error) => {
        setGuides([])
        setLoadError(error instanceof Error ? error.message : 'Failed to load onboarding guides')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetchGuides()
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [currentProject])

  const selectedGuide = guides.find((guide) => guide.id === selectedGuideId) ?? guides[0] ?? null

  const saveGuide = async () => {
    if (!currentProject) return

    const normalizedTitle = draft.title.trim()
    const normalizedSlug = toSlug(draft.slug || draft.title)
    const normalizedBody = draft.body.trim()

    if (!normalizedTitle) {
      throw new Error('Guide title is required')
    }

    if (!normalizedSlug) {
      throw new Error('Guide slug is required')
    }

    if (!normalizedBody) {
      throw new Error('Guide body is required')
    }

    const payload = {
      projectId: currentProject.id,
      title: normalizedTitle,
      slug: normalizedSlug,
      audienceRole: draft.audienceRole || null,
      summary: draft.summary.trim() || null,
      body: normalizedBody,
      isPublished: true,
      order: guides.length,
    }

    const response = await fetch('/api/onboarding-guides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to save guide'))
    }

    setDraft(EMPTY_DRAFT)
    fetchGuides()
  }

  if (!currentProject) return null

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Onboarding Guides</CardTitle>
          <p className="text-sm text-muted-foreground">Role-aware operating guides for project onboarding and adoption.</p>
          {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {canManage ? (
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
              <div className="space-y-3">
                <div className="space-y-2"><Label>Title</Label><Input value={draft.title} maxLength={GUIDE_MAX_TITLE_LENGTH} onChange={(event) => setDraft((state) => ({ ...state, title: event.target.value, slug: toSlug(event.target.value) }))} /></div>
                <div className="space-y-2"><Label>Slug</Label><Input value={draft.slug} maxLength={GUIDE_MAX_TITLE_LENGTH} onChange={(event) => setDraft((state) => ({ ...state, slug: toSlug(event.target.value) }))} /></div>
                <div className="space-y-2"><Label>Audience role</Label><Select value={draft.audienceRole || 'all'} onValueChange={(value) => setDraft((state) => ({ ...state, audienceRole: value === 'all' ? '' : value }))}><SelectTrigger><SelectValue placeholder="All project members" /></SelectTrigger><SelectContent><SelectItem value="all">All project members</SelectItem>{GUIDE_ROLE_OPTIONS.map((role) => (<SelectItem key={role} value={role}>{role}</SelectItem>))}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Summary</Label><Input value={draft.summary} maxLength={GUIDE_MAX_SUMMARY_LENGTH} onChange={(event) => setDraft((state) => ({ ...state, summary: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Body</Label><Textarea rows={8} maxLength={GUIDE_MAX_BODY_LENGTH} value={draft.body} onChange={(event) => setDraft((state) => ({ ...state, body: event.target.value }))} /></div>
                <Button
                  onClick={() => {
                    void saveGuide().catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to save guide'))
                  }}
                >
                  Create Guide
                </Button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading guides…</div>
          ) : guides.length === 0 ? (
            <div className="text-sm text-muted-foreground">No onboarding guides published yet.</div>
          ) : (
            guides.map((guide) => (
              <button
                key={guide.id}
                onClick={() => setSelectedGuideId(guide.id)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedGuide?.id === guide.id ? 'border-primary bg-primary/5' : 'border-border/70 bg-card/70'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{guide.title}</span>
                  {guide.audienceRole ? <Badge variant="outline">{guide.audienceRole}</Badge> : null}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{guide.summary || 'No summary provided.'}</div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selectedGuide?.title || 'Guide preview'}</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedGuide ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{selectedGuide.content.body}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a guide to preview it.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}