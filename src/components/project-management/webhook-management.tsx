'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
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

  const fetchWebhooks = useCallback(async () => {
    if (!currentProject) return
    setLoading(true)
    try {
      const res = await fetch(`/api/webhooks?projectId=${currentProject.id}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load webhooks'))
      }
      const data = await res.json()
      setWebhooks(data.webhooks ?? data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  useEffect(() => { fetchWebhooks() }, [fetchWebhooks])

  const fetchDeliveries = async (webhookId: string) => {
    const res = await fetch(`/api/webhooks/${webhookId}?deliveries=true`)
    if (!res.ok) {
      toast.error(await getApiErrorMessage(res, 'Failed to load webhook deliveries'))
      return
    }

    const data = await res.json()
    setDeliveries((prev) => ({ ...prev, [webhookId]: data.deliveries ?? [] }))
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
    if (!currentProject || !url || !name) return
    setSaving(true)
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          name,
          url,
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
      toast.error(error instanceof Error ? error.message : 'Failed to create webhook')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (wh: WebhookItem) => {
    const res = await fetch(`/api/webhooks/${wh.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !wh.isActive }),
    })
    if (!res.ok) {
      toast.error(await getApiErrorMessage(res, 'Failed to update webhook'))
      return
    }

    await fetchWebhooks()
  }

  const deleteConfirm = useDestructiveConfirm<{ id: string; name: string; url: string }>()

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(await getApiErrorMessage(res, 'Failed to delete webhook'))
      return
    }

    await fetchWebhooks()
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
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Webhook
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Webhook</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  placeholder="e.g. CI/CD Pipeline"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payload URL</Label>
                <Input
                  placeholder="https://example.com/webhook"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
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
              <Button onClick={handleCreate} disabled={!name || !url || saving}>
                {saving ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
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
                    className="flex-shrink-0"
                    onClick={() => toggleExpand(wh.id)}
                  >
                    {expandedId === wh.id ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
                    {!deliveries[wh.id] ? (
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
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
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
        onConfirm={async () => {
          if (deleteConfirm.target) await handleDelete(deleteConfirm.target.id)
        }}
      />
    </div>
  )
}
