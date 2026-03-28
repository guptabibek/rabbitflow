'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Shield, UserCog, Trash2 } from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'

type Rule = {
  id: string
  projectId: string
  areaId: string | null
  role: string
  permission: string
  effect: 'allow' | 'deny'
}

type Area = {
  id: string
  name: string
  path: string | null
}

type Member = {
  id: string
  role: string
  extraPermissions: string[] | unknown
  user: {
    id: string
    name: string | null
    email: string
    avatar: string | null
  }
}

const GRANTABLE_PERMISSIONS = [
  'operations:manage',
  'branding:manage',
  'test:manage',
  'onboarding:manage',
  'project:members:manage',
  'masterdata:manage',
  'acl:manage',
] as const

const PERMISSION_LABELS: Record<string, string> = {
  'operations:manage': 'Operations',
  'branding:manage': 'Branding',
  'test:manage': 'Test Management',
  'onboarding:manage': 'Onboarding',
  'project:members:manage': 'Member Management',
  'masterdata:manage': 'Master Data',
  'acl:manage': 'ACL Management',
}

function parseExtraPermissions(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return [] }
  }
  return []
}

export function AclManagement() {
  const currentProject = useAppStore((state) => state.currentProject)
  const [rules, setRules] = useState<Rule[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [draft, setDraft] = useState({ role: 'Dev', permission: 'workitem:read', effect: 'allow', areaId: '' })
  const [loading, setLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState('users')
  const [editMember, setEditMember] = useState<Member | null>(null)
  const [editPermissions, setEditPermissions] = useState<Set<string>>(new Set())
  const [savingMember, setSavingMember] = useState(false)

  const fetchRules = useCallback(() => {
    if (!currentProject) return
    setLoading(true)
    fetch(`/api/rbac/rules?projectId=${currentProject.id}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, 'Failed to load ACL rules'))
        }
        return response.json()
      })
      .then((payload) => {
        setRules(payload.rules ?? [])
        setAreas(payload.areas ?? [])
        setPermissions(payload.permissions ?? [])
        setLoadError(null)
      })
      .catch((error) => {
        setRules([])
        setAreas([])
        setPermissions([])
        setLoadError(error instanceof Error ? error.message : 'Failed to load ACL rules')
      })
      .finally(() => setLoading(false))
  }, [currentProject])

  const fetchMembers = useCallback(() => {
    if (!currentProject) return
    setMembersLoading(true)
    fetch(`/api/projects/${currentProject.id}/members`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, 'Failed to load members'))
        }
        return response.json()
      })
      .then((data) => {
        setMembers(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        setMembers([])
      })
      .finally(() => setMembersLoading(false))
  }, [currentProject])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetchRules()
      fetchMembers()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [fetchRules, fetchMembers])

  const createRule = async () => {
    if (!currentProject) return
    const response = await fetch('/api/rbac/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: currentProject.id,
        role: draft.role,
        permission: draft.permission,
        effect: draft.effect,
        areaId: draft.areaId || null,
      }),
    })

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to create ACL rule'))
    }
    fetchRules()
  }

  const handleFlipRule = async (rule: Rule) => {
    try {
      const response = await fetch(`/api/rbac/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effect: rule.effect === 'allow' ? 'deny' : 'allow' }),
      })
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to update ACL rule'))
      }
      fetchRules()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update ACL rule')
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    try {
      const response = await fetch(`/api/rbac/rules/${ruleId}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to delete ACL rule'))
      }
      fetchRules()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete ACL rule')
    }
  }

  const openMemberDialog = (member: Member) => {
    setEditMember(member)
    setEditPermissions(new Set(parseExtraPermissions(member.extraPermissions)))
  }

  const handleTogglePermission = (perm: string) => {
    setEditPermissions((prev) => {
      const next = new Set(prev)
      if (next.has(perm)) {
        next.delete(perm)
      } else {
        next.add(perm)
      }
      return next
    })
  }

  const handleSaveMemberPermissions = async () => {
    if (!currentProject || !editMember) return
    setSavingMember(true)
    try {
      const response = await fetch(
        `/api/projects/${currentProject.id}/members/${editMember.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            extraPermissions: Array.from(editPermissions),
          }),
        }
      )
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to update permissions'))
      }
      toast.success(`Permissions updated for ${editMember.user.name || editMember.user.email}`)
      setEditMember(null)
      fetchMembers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update permissions')
    } finally {
      setSavingMember(false)
    }
  }

  if (!currentProject) return null

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div>
        <h2 className="text-lg font-semibold">Access Control</h2>
        <p className="text-sm text-muted-foreground">
          Manage per-user feature access and role-based permission overrides.
        </p>
        {loadError ? <p className="mt-1 text-sm text-destructive">{loadError}</p> : null}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <UserCog className="h-3.5 w-3.5" />
            User Permissions
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Role Overrides
          </TabsTrigger>
        </TabsList>

        {/* ── Per-User Permissions ────────────────────────────── */}
        <TabsContent value="users" className="mt-3">
          {membersLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : members.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <UserCog className="mb-3 h-10 w-10 opacity-50" />
                <p className="font-medium">No project members</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {members.map((member) => {
                const extras = parseExtraPermissions(member.extraPermissions)
                return (
                  <Card key={member.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {(member.user.name?.[0] ?? member.user.email[0]).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {member.user.name || member.user.email}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {member.role}
                          </Badge>
                        </div>
                        {extras.length > 0 ? (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {extras.map((p) => (
                              <Badge key={p} variant="secondary" className="text-[10px]">
                                {PERMISSION_LABELS[p] ?? p}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            No extra permissions — role defaults apply
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openMemberDialog(member)}
                      >
                        Edit Access
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Role‑Based ACL Overrides ───────────────────────── */}
        <TabsContent value="rules" className="mt-3">
          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Add Role Override</CardTitle>
                <p className="text-sm text-muted-foreground">Per-role, per-action, and per-area access overrides.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={draft.role} onValueChange={(v) => setDraft((s) => ({ ...s, role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer'].map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Permission</Label>
                  <Select value={draft.permission} onValueChange={(v) => setDraft((s) => ({ ...s, permission: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {permissions.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Area Scope</Label>
                  <Select value={draft.areaId || '__whole__'} onValueChange={(v) => setDraft((s) => ({ ...s, areaId: v === '__whole__' ? '' : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__whole__">Whole project</SelectItem>
                      {areas.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.path || a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Effect</Label>
                  <Select value={draft.effect} onValueChange={(v) => setDraft((s) => ({ ...s, effect: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">Allow</SelectItem>
                      <SelectItem value="deny">Deny</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    void createRule().catch((error) =>
                      toast.error(error instanceof Error ? error.message : 'Failed to create ACL rule')
                    )
                  }}
                >
                  Add Rule
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Rule Matrix</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : rules.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No ACL overrides yet. Default role permissions remain active.</div>
                ) : (
                  rules.map((rule) => (
                    <div key={rule.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{rule.role}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-sm">{rule.permission}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{areas.find((a) => a.id === rule.areaId)?.path || 'Whole project'}</span>
                          <Badge variant={rule.effect === 'allow' ? 'default' : 'destructive'} className="text-[10px]">
                            {rule.effect}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleFlipRule(rule)}
                        >
                          Flip to {rule.effect === 'allow' ? 'deny' : 'allow'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => void handleDeleteRule(rule.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Edit User Permissions Dialog ─────────────────── */}
      <Dialog open={!!editMember} onOpenChange={(open) => { if (!open) setEditMember(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit Permissions — {editMember?.user.name || editMember?.user.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-2">
            <p className="text-sm text-muted-foreground mb-3">
              Grant additional feature access beyond the <Badge variant="outline" className="text-[10px] mx-0.5">{editMember?.role}</Badge> role defaults.
            </p>
            {GRANTABLE_PERMISSIONS.map((perm) => (
              <label
                key={perm}
                className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:bg-accent/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={editPermissions.has(perm)}
                  onCheckedChange={() => handleTogglePermission(perm)}
                />
                <div>
                  <div className="text-sm font-medium">{PERMISSION_LABELS[perm]}</div>
                  <div className="text-xs text-muted-foreground">{perm}</div>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}>Cancel</Button>
            <Button onClick={handleSaveMemberPermissions} disabled={savingMember}>
              {savingMember ? 'Saving…' : 'Save Permissions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}