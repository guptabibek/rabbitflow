'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Webhook,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'
import {
  ConfirmDestructiveDialog,
  useDestructiveConfirm,
} from '@/components/project-management/confirm-destructive-dialog'
import { ErrorState, InlineAlert } from '@/components/ui/states'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookItem {
  id: string
  projectId: string
  name: string
  url: string
  secret: string | null
  events: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface WebhookDelivery {
  id: string
  webhookId: string
  event: string
  statusCode: number | null
  success: boolean
  payload: Record<string, unknown>
  responseBody: string | null
  error: string | null
  attempt: number
  duration: number | null
  createdAt: string
}

const ALL_EVENTS = [
  'issue.created',
  'issue.updated',
  'issue.deleted',
  'comment.created',
  'comment.updated',
  'sprint.started',
  'sprint.completed',
  'label.created',
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WebhookManagement() {
  const { currentProject } = useAppStore()
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({})

  // Form
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'name' | 'url', string>>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [deliveryErrors, setDeliveryErrors] = useState<Record<string, string>>({})

  const fetchWebhooks = useCallback(async () => {
    if (!currentProject) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/webhooks?projectId=${currentProject.id}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load webhooks'))
      }
      const data = await res.json()
      setWebhooks(data.webhooks ?? data)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  useEffect(() => { fetchWebhooks() }, [fetchWebhooks])

  const fetchDeliveries = async (webhookId: string) => {
    setDeliveryErrors((previous) => ({ ...previous, [webhookId]: '' }))
    try {
      const res = await fetch(`/api/webhooks/${webhookId}?deliveries=true`)
      if (!res.ok) {
        setDeliveryErrors((previous) => ({
          ...previous,
          [webhookId]: 'Failed to load webhook deliveries',
        }))
        return
      }

      const data = await res.json()
      setDeliveries((prev) => ({ ...prev, [webhookId]: data.deliveries ?? [] }))
    } catch {
      setDeliveryErrors((previous) => ({
        ...previous,
        [webhookId]: 'Failed to load webhook deliveries',
      }))
    }
  }

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      if (!deliveries[id]) fetchDeliveries(id)
    }
  }

  const handleCreate = async () => {
    if (!currentProject) return
    const nextErrors: typeof fieldErrors = {}
    if (!name.trim()) nextErrors.name = 'Enter a webhook name.'
    if (!url.trim()) {
      nextErrors.url = 'Enter a payload URL.'
    } else {
      try {
        const parsed = new URL(url.trim())
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          nextErrors.url = 'Use an HTTP or HTTPS URL.'
        }
      } catch {
        nextErrors.url = 'Enter a valid absolute URL.'
      }
    }
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setFormError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          name: name.trim(),
          url: url.trim(),
          secret: secret || undefined,
          events: selectedEvents.length ? selectedEvents : ALL_EVENTS,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to create webhook'))
      }
      setCreateOpen(false)
      setName('')
      setUrl('')
      setSecret('')
      setSelectedEvents([])
      await fetchWebhooks()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create webhook')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (wh: WebhookItem) => {
    setActionError(null)
    try {
      const res = await fetch(`/api/webhooks/${wh.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !wh.isActive }),
      })
      if (!res.ok) {
        setActionError(await getApiErrorMessage(res, 'Failed to update webhook'))
        return
      }

      await fetchWebhooks()
    } catch {
      setActionError('Failed to update webhook')
    }
  }

  const deleteConfirm = useDestructiveConfirm<{ id: string; name: string; url: string }>()

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        return await getApiErrorMessage(res, 'Failed to delete webhook')
      }

      await fetchWebhooks()
      return true
    } catch {
      return 'Failed to delete webhook'
    }
  }

  const toggleEvent = (e: string) => {
    setSelectedEvents((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]
    )
  }

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a project to manage webhooks.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Webhooks</h2>
          <p className="text-sm text-muted-foreground">
            Send real-time event notifications to external services.
          </p>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open)
            if (!open) {
              setFormError(null)
              setFieldErrors({})
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Webhook
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Webhook</DialogTitle>
              <DialogDescription>
                Choose the endpoint and events that should receive signed notifications.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {formError ? (
                <div data-testid="webhook-create-error">
                  <InlineAlert tone="danger">{formError}</InlineAlert>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="webhook-name">Name</Label>
                <Input
                  id="webhook-name"
                  placeholder="e.g. CI/CD Pipeline"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setFieldErrors((previous) => ({ ...previous, name: undefined }))
                    setFormError(null)
                  }}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'webhook-name-error' : undefined}
                  data-testid="webhook-name-input"
                />
                {fieldErrors.name ? (
                  <p id="webhook-name-error" className="text-xs text-destructive">
                    {fieldErrors.name}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="webhook-url">Payload URL</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://example.com/webhook"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    setFieldErrors((previous) => ({ ...previous, url: undefined }))
                    setFormError(null)
                  }}
                  aria-invalid={Boolean(fieldErrors.url)}
                  aria-describedby={fieldErrors.url ? 'webhook-url-error' : undefined}
                  data-testid="webhook-url-input"
                />
                {fieldErrors.url ? (
                  <p id="webhook-url-error" className="text-xs text-destructive">
                    {fieldErrors.url}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>Secret (optional)</Label>
                <Input
                  placeholder="Shared secret for signature verification"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Events</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_EVENTS.map((ev) => (
                    <Badge
                      key={ev}
                      variant={selectedEvents.includes(ev) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleEvent(ev)}
                    >
                      {ev}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  No selection = all events.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving} data-testid="webhook-create-submit">
                {saving ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {actionError ? (
        <div data-testid="webhook-action-error">
          <InlineAlert tone="danger">{actionError}</InlineAlert>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : loadError ? (
        <ErrorState
          title="Webhooks did not load"
          description="The endpoint list could not be read. Nothing has changed."
          detail={loadError}
          onRetry={() => void fetchWebhooks()}
          size="sm"
        />
      ) : webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Webhook className="mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">No webhooks configured</p>
            <p className="text-sm">Add a webhook to start receiving event notifications.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => (
            <Card key={wh.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <button
                    className="flex-shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => toggleExpand(wh.id)}
                    aria-expanded={expandedId === wh.id}
                    aria-label={
                      expandedId === wh.id
                        ? `Hide delivery history for ${wh.name}`
                        : `Show delivery history for ${wh.name}`
                    }
                  >
                    {expandedId === wh.id ? (
                      <ChevronDown aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{wh.name}</span>
                      <Badge variant={wh.isActive ? 'default' : 'secondary'} className="text-[10px]">
                        {wh.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{wh.url}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {wh.events.slice(0, 4).map((e) => (
                        <Badge key={e} variant="outline" className="text-[10px]">
                          {e}
                        </Badge>
                      ))}
                      {wh.events.length > 4 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{wh.events.length - 4}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={wh.isActive}
                      onCheckedChange={() => handleToggle(wh)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      aria-label="Delete webhook"
                      onClick={() => deleteConfirm.request(wh)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {expandedId === wh.id && (
                  <div className="mt-3 border-t pt-3">
                    <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                      Recent Deliveries
                    </h4>
                    {deliveryErrors[wh.id] ? (
                      <InlineAlert
                        tone="danger"
                        action={
                          <Button size="sm" variant="outline" onClick={() => void fetchDeliveries(wh.id)}>
                            Retry
                          </Button>
                        }
                      >
                        {deliveryErrors[wh.id]}
                      </InlineAlert>
                    ) : !deliveries[wh.id] ? (
                      <Skeleton className="h-8 w-full" />
                    ) : deliveries[wh.id].length === 0 ? (
                      <p className="text-xs text-muted-foreground">No deliveries yet.</p>
                    ) : (
                      <ScrollArea className="max-h-48">
                        <div className="space-y-1.5">
                          {deliveries[wh.id].map((d) => (
                            <div
                              key={d.id}
                              className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs"
                            >
                              {d.success ? (
                                <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-success" />
                              ) : (
                                <XCircle aria-hidden="true" className="h-3.5 w-3.5 text-danger" />
                              )}
                              <span className="font-mono">{d.event}</span>
                              <span className="text-muted-foreground">try {d.attempt}</span>
                              <span className="text-muted-foreground">
                                {d.statusCode ?? 'ERR'}
                              </span>
                              {d.error ? (
                                <span className="truncate text-destructive">{d.error}</span>
                              ) : null}
                              <span className="ml-auto text-muted-foreground">
                                {new Date(d.createdAt).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDestructiveDialog
        open={deleteConfirm.isOpen}
        onOpenChange={deleteConfirm.onOpenChange}
        title={`Delete webhook "${deleteConfirm.target?.name ?? ''}"?`}
        description="No further events will be delivered to this endpoint, and its delivery history will be removed. This cannot be undone."
        onConfirm={() =>
          deleteConfirm.target ? handleDelete(deleteConfirm.target.id) : false
        }
      />
    </div>
  )
}
