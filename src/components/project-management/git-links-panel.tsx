'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  GitBranch,
  GitCommit,
  GitPullRequest,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCcw,
} from 'lucide-react'
import { fetchWithRetry, getApiErrorMessage, parseJsonResponse } from '@/lib/utils'
import {
  ConfirmDestructiveDialog,
  useDestructiveConfirm,
} from '@/components/project-management/confirm-destructive-dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitLink {
  id: string
  issueId: string
  provider: 'github' | 'gitlab' | 'bitbucket' | 'azure_devops'
  linkType: 'branch' | 'commit' | 'pull_request'
  externalUrl: string
  externalId: string | null
  title: string | null
  branch: string | null
  createdAt: string
}

interface GitLinksPanelProps {
  issueId: string
  projectId: string
}

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  azure_devops: 'Azure DevOps',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GitLinksPanel({ issueId, projectId }: GitLinksPanelProps) {
  const [links, setLinks] = useState<GitLink[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form
  const [provider, setProvider] = useState<GitLink['provider']>('github')
  const [linkType, setLinkType] = useState<GitLink['linkType']>('branch')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [ref, setRef] = useState('')

  const fetchLinks = useCallback(async () => {
    setLoading(true)
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setLoadError('You are offline. Linked git references are stale until the network returns.')
        return
      }

      const res = await fetchWithRetry(`/api/git-links?issueId=${issueId}&projectId=${projectId}`, {
        timeoutMs: 6_000,
        retries: 1,
      })

      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load git links'))
      }

      const data = await parseJsonResponse<{ links?: GitLink[] } | GitLink[] | null>(res, null)
      if (!data) {
        throw new Error('Git links returned malformed data')
      }

      setLinks(Array.isArray(data) ? data : (data.links ?? []))
      setLoadError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load git links'
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [issueId, projectId])

  useEffect(() => { fetchLinks() }, [fetchLinks])

  const handleCreate = async () => {
    if (!url) return
    setSaving(true)
    try {
      const res = await fetch('/api/git-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId,
          projectId,
          provider,
          linkType,
          externalUrl: url,
          externalId: ref || url,
          title: title || undefined,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to create git link'))
      }
      setCreateOpen(false)
      setUrl('')
      setTitle('')
      setRef('')
      await fetchLinks()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create git link')
    } finally {
      setSaving(false)
    }
  }

  const deleteConfirm = useDestructiveConfirm<GitLink>()

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/git-links/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to delete git link'))
      }

      await fetchLinks()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete git link')
    }
  }

  const linkIcon = (type: string) => {
    switch (type) {
      case 'branch':
        return <GitBranch className="h-3.5 w-3.5" />
      case 'commit':
        return <GitCommit className="h-3.5 w-3.5" />
      case 'pull_request':
        return <GitPullRequest className="h-3.5 w-3.5" />
      default:
        return <GitBranch className="h-3.5 w-3.5" />
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          Git Links
        </h4>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => void fetchLinks()}
            aria-label="Refresh git links"
          >
            <RefreshCcw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3 w-3" />
            Link
          </Button>
        </div>
      </div>

      {loadError ? <p className="text-[11px] text-destructive">{loadError}</p> : null}

      {loading ? (
        <Skeleton className="h-8 w-full" />
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground">No linked branches, commits, or PRs.</p>
      ) : (
        <div className="space-y-1.5">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 group"
            >
              <span className="text-muted-foreground">
                {linkIcon(link.linkType)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium truncate">
                    {link.title || link.externalId || link.externalUrl.split('/').pop()}
                  </span>
                  <Badge variant="outline" className="text-[9px]">
                    {PROVIDER_LABELS[link.provider]}
                  </Badge>
                </div>
              </div>
              <a
                href={link.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive"
                onClick={() => deleteConfirm.request(link)}
                aria-label="Remove linked git resource"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Git Reference</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as GitLink['provider'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">GitHub</SelectItem>
                    <SelectItem value="gitlab">GitLab</SelectItem>
                    <SelectItem value="bitbucket">Bitbucket</SelectItem>
                    <SelectItem value="azure_devops">Azure DevOps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={linkType} onValueChange={(v) => setLinkType(v as GitLink['linkType'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="branch">Branch</SelectItem>
                    <SelectItem value="commit">Commit</SelectItem>
                    <SelectItem value="pull_request">Pull Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/org/repo/tree/feature-branch"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Title (optional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. feature/auth-flow"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ref (optional)</Label>
              <Input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="e.g. abc123f or feature/auth-flow"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!url || saving}>
              {saving ? 'Linking…' : 'Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        open={deleteConfirm.isOpen}
        onOpenChange={deleteConfirm.onOpenChange}
        title="Remove git link?"
        description={
          deleteConfirm.target
            ? `This unlinks the ${deleteConfirm.target.linkType.replace('_', ' ')} "${deleteConfirm.target.title ?? deleteConfirm.target.externalUrl}" from this work item. The branch, commit or pull request itself is not affected.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={async () => {
          if (deleteConfirm.target) await handleDelete(deleteConfirm.target.id)
        }}
      />
    </div>
  )
}
