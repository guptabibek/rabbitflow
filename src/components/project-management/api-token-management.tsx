'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
  Key,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils'

const MAX_TOKEN_NAME_LENGTH = 200

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiToken {
  id: string
  name: string
  prefix: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

const ALL_SCOPES = [
  'issues:read',
  'issues:write',
  'projects:read',
  'projects:write',
  'comments:read',
  'comments:write',
  'admin',
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiTokenManagement() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newTokenSecret, setNewTokenSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ApiToken | null>(null)

  // Form
  const [tName, setTName] = useState('')
  const [tScopes, setTScopes] = useState<string[]>([])
  const [tExpDays, setTExpDays] = useState('90')

  const fetchTokens = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/api-tokens')
      if (!res.ok) {
        toast.error(await getApiErrorMessage(res, 'Failed to load API tokens'))
        setTokens([])
        return
      }

      const data = await res.json()
      setTokens(data.tokens ?? data)
    } catch {
      toast.error('Failed to load API tokens')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTokens() }, [fetchTokens])

  const handleCreate = async () => {
    if (!tName.trim()) return

    if (tName.trim().length > MAX_TOKEN_NAME_LENGTH) {
      toast.error(`Token name cannot exceed ${MAX_TOKEN_NAME_LENGTH} characters`)
      return
    }

    setSaving(true)
    try {
      const expDays = parseInt(tExpDays, 10)

      const res = await fetch('/api/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tName.trim(),
          scopes: tScopes.length > 0 ? tScopes : ALL_SCOPES,
          expiresInDays: expDays > 0 ? expDays : undefined,
        }),
      })

      if (!res.ok) {
        toast.error(await getApiErrorMessage(res, 'Failed to create API token'))
        return
      }

      const data = await res.json()
      setNewTokenSecret(data.fullToken ?? data.token ?? null)
      setTName('')
      setTScopes([])
      setTExpDays('90')
      await fetchTokens()
      toast.success('API token created')
    } catch {
      toast.error('Failed to create API token')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return

    setSaving(true)
    try {
      const res = await fetch(`/api/api-tokens/${pendingDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error(await getApiErrorMessage(res, 'Failed to revoke API token'))
        return
      }

      setPendingDelete(null)
      await fetchTokens()
      toast.success('API token revoked')
    } catch {
      toast.error('Failed to revoke API token')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Token copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy token')
    }
  }

  const toggleScope = (scope: string) => {
    setTScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  const handleDialogClose = (open: boolean) => {
    setCreateOpen(open)
    if (!open) {
      setNewTokenSecret(null)
      setCopied(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">API Tokens</h2>
          <p className="text-sm text-muted-foreground">
            Create personal access tokens for API authentication.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Token
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {newTokenSecret ? 'Token Created' : 'Create API Token'}
              </DialogTitle>
            </DialogHeader>

            {newTokenSecret ? (
              <div className="space-y-3 py-2">
                <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-600 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Token created successfully. Copy it now — it won&apos;t be shown again.
                </div>
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                  <code className="flex-1 break-all text-xs font-mono">
                    {newTokenSecret}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={() => handleCopy(newTokenSecret)}
                  >
                    {copied ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Token Name</Label>
                  <Input
                    value={tName}
                    maxLength={MAX_TOKEN_NAME_LENGTH}
                    onChange={(e) => setTName(e.target.value)}
                    placeholder="e.g. CI/CD Pipeline"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Scopes</Label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_SCOPES.map((scope) => (
                      <Badge
                        key={scope}
                        variant={tScopes.includes(scope) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleScope(scope)}
                      >
                        {scope}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No selection = all scopes.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Expires In</Label>
                  <Select value={tExpDays} onValueChange={setTExpDays}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">180 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                      <SelectItem value="0">No expiration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter>
              {newTokenSecret ? (
                <Button onClick={() => handleDialogClose(false)}>Done</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => handleDialogClose(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={!tName || saving}>
                    {saving ? 'Creating…' : 'Create Token'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : tokens.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Key className="mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">No API tokens</p>
            <p className="text-sm">Create a token to authenticate API requests.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tokens.map((token) => (
            <Card key={token.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <Key className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{token.name}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {token.prefix}…
                    </code>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {token.scopes.slice(0, 4).map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                    {token.scopes.length > 4 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{token.scopes.length - 4}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>Created {new Date(token.createdAt).toLocaleDateString()}</span>
                    {token.expiresAt && (
                      <span>
                        Expires {new Date(token.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                    {token.lastUsedAt && (
                      <span>
                        Last used {new Date(token.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => setPendingDelete(token)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API token?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `This will permanently revoke "${pendingDelete.name}" and any integrations using it will stop working immediately.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving}>
              {saving ? 'Revoking…' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
