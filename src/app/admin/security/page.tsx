'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InlineAlert } from '@/components/ui/states'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Metric, MetricRow } from '@/components/ui/metric'
import { PageBody, PageHeader } from '@/components/ui/page-header'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ConfirmDestructiveDialog,
  useDestructiveConfirm,
} from '@/components/project-management/confirm-destructive-dialog'
import {
  Ellipsis,
  History,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  RefreshCcw,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react'

type SecurityUser = {
  id: string
  name: string
  email: string
  globalRole: string
  isActive: boolean
  deactivatedAt: string | null
  mfaEnabled: boolean
  mfaEnabledAt: string | null
  mfaReenrollRequired: boolean
  activeSessions: number
  lastSeenAt: string | null
}

type SecuritySession = {
  id: string
  deviceLabel: string | null
  userAgent: string | null
  ipAddress: string | null
  mfaVerifiedAt: string | null
  mfaBypassed: boolean
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  revokedAt: string | null
  revokedReason: string | null
}

type SecurityAuditEvent = {
  id: string
  action: string
  details: Record<string, unknown> | null
  createdAt: string
  actorUser: {
    id: string
    name: string
    email: string
    avatar: string | null
  } | null
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleString()
}

function formatAuditAction(action: string) {
  switch (action) {
    case 'MFA_DISABLED':
      return 'MFA disabled'
    case 'MFA_ENFORCED':
      return 'MFA enforced for next sign-in'
    case 'MFA_RESET_ONLY':
      return 'MFA reset (sessions preserved)'
    case 'MFA_RESET_WITH_SESSION_REVOKE':
      return 'MFA reset and sessions revoked'
    case 'SESSION_REVOKED':
      return 'Single session revoked'
    case 'SESSIONS_REVOKED_ALL':
      return 'All sessions revoked'
    case 'USER_DEACTIVATED':
      return 'User access removed'
    default:
      return action.replace(/_/g, ' ')
  }
}

function describeAuditDetails(event: SecurityAuditEvent) {
  if (!event.details || typeof event.details !== 'object') {
    return null
  }

  const details = event.details as Record<string, unknown>
  const revokedSessions = details.revokedSessions

  if (typeof revokedSessions === 'number') {
    return `${revokedSessions} session${revokedSessions === 1 ? '' : 's'} affected`
  }

  if (typeof details.sessionId === 'string') {
    return `Session: ${details.sessionId}`
  }

  if (
    typeof details.removedProjectMemberships === 'number' ||
    typeof details.clearedAssignments === 'number'
  ) {
    return [
      typeof details.removedProjectMemberships === 'number'
        ? `${details.removedProjectMemberships} project memberships removed`
        : null,
      typeof details.clearedAssignments === 'number'
        ? `${details.clearedAssignments} assignments cleared`
        : null,
    ]
      .filter(Boolean)
      .join(' • ')
  }

  return null
}

export default function AdminSecurityPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<SecurityUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [sessions, setSessions] = useState<SecuritySession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [auditEvents, setAuditEvents] = useState<SecurityAuditEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [operationLoading, setOperationLoading] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const accessRemoval = useDestructiveConfirm<SecurityUser>()

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId]
  )

  const activeUsers = users.filter((user) => user.isActive).length
  const mfaProtectedUsers = users.filter(
    (user) => user.isActive && (user.mfaEnabled || user.mfaReenrollRequired)
  ).length
  const activeSessionCount = users.reduce((total, user) => total + user.activeSessions, 0)
  const mfaAttentionCount = users.filter(
    (user) => user.isActive && !user.mfaEnabled && !user.mfaReenrollRequired
  ).length

  const loadUsers = async (search: string, keepSelection = true): Promise<string | null> => {
    const response = await fetch(`/api/admin/security/users?query=${encodeURIComponent(search)}`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.error || 'Failed to load admin security users')
    }

    const payload = await response.json()
    const nextUsers: SecurityUser[] = Array.isArray(payload) ? payload : []

    setUsers(nextUsers)

    if (nextUsers.length === 0) {
      setSelectedUserId('')
      setSessions([])
      setAuditEvents([])
      return null
    }

    const nextSelectedUserId =
      keepSelection && nextUsers.some((user) => user.id === selectedUserId)
        ? selectedUserId
        : nextUsers[0].id

    if (nextSelectedUserId !== selectedUserId) {
      setSelectedUserId(nextSelectedUserId)
    }

    return nextSelectedUserId
  }

  const loadSessions = async (userId: string) => {
    setSessionsLoading(true)
    setPageError(null)
    try {
      const response = await fetch(`/api/admin/security/users/${userId}/sessions`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to load user sessions')
      }

      const payload = await response.json()
      const nextSessions: SecuritySession[] = Array.isArray(payload?.sessions)
        ? payload.sessions
        : []
      setSessions(nextSessions)
    } catch (error) {
      console.error(error)
      setPageError(error instanceof Error ? error.message : 'Failed to load sessions')
    } finally {
      setSessionsLoading(false)
    }
  }

  const loadAudit = async (userId: string) => {
    setAuditLoading(true)
    setPageError(null)
    try {
      const response = await fetch(`/api/admin/security/users/${userId}/audit?limit=100`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to load security timeline')
      }

      const payload = await response.json()
      const nextEvents: SecurityAuditEvent[] = Array.isArray(payload?.events)
        ? payload.events
        : []
      setAuditEvents(nextEvents)
    } catch (error) {
      console.error(error)
      setPageError(error instanceof Error ? error.message : 'Failed to load security timeline')
    } finally {
      setAuditLoading(false)
    }
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
        if (!meRes.ok) {
          router.replace('/login')
          return
        }

        const me = await meRes.json()
        if (me?.globalRole !== 'admin') {
          setAccessDenied(true)
          setIsLoading(false)
          return
        }

        await loadUsers('', false)
      } catch (error) {
        console.error(error)
        setPageError('Failed to initialize admin security page')
      } finally {
        setIsLoading(false)
      }
    }

    void initialize()
  }, [router])

  useEffect(() => {
    if (!selectedUserId) {
      setSessions([])
      setAuditEvents([])
      return
    }

    void Promise.all([loadSessions(selectedUserId), loadAudit(selectedUserId)])
  }, [selectedUserId])

  const refreshAll = async () => {
    setIsRefreshing(true)
    setPageError(null)
    try {
      const resolvedUserId = await loadUsers(query)
      if (resolvedUserId) {
        await Promise.all([loadSessions(resolvedUserId), loadAudit(resolvedUserId)])
      }
      toast.success('Security data refreshed')
    } catch (error) {
      console.error(error)
      setPageError(error instanceof Error ? error.message : 'Refresh failed')
    } finally {
      setIsRefreshing(false)
    }
  }

  const resetMfaForUser = async (userId: string, revokeSessions: boolean) => {
    setOperationLoading(true)
    setPageError(null)
    try {
      const response = await fetch(`/api/admin/security/users/${userId}/mfa/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revokeSessions }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to reset MFA')
      }

      toast.success(payload?.message || 'MFA reset completed')
      const resolvedUserId = await loadUsers(query)
      if (resolvedUserId) {
        await Promise.all([loadSessions(resolvedUserId), loadAudit(resolvedUserId)])
      }
    } catch (error) {
      console.error(error)
      setPageError(error instanceof Error ? error.message : 'MFA reset failed')
    } finally {
      setOperationLoading(false)
    }
  }

  const updateMfaPolicyForUser = async (userId: string, action: 'enable' | 'disable') => {
    setOperationLoading(true)
    setPageError(null)
    try {
      const response = await fetch(`/api/admin/security/users/${userId}/mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revokeSessions: true }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update MFA policy')
      }

      toast.success(payload?.message || 'MFA policy updated')
      const resolvedUserId = await loadUsers(query)
      if (resolvedUserId) {
        await Promise.all([loadSessions(resolvedUserId), loadAudit(resolvedUserId)])
      }
    } catch (error) {
      console.error(error)
      setPageError(error instanceof Error ? error.message : 'MFA policy update failed')
    } finally {
      setOperationLoading(false)
    }
  }

  const deactivateUser = async (userId: string) => {
    setOperationLoading(true)
    setPageError(null)
    try {
      const response = await fetch(`/api/admin/security/users/${userId}`, {
        method: 'DELETE',
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to deactivate user')
      }

      toast.success(payload?.message || 'User deactivated')
      const resolvedUserId = await loadUsers(query)
      if (resolvedUserId) {
        await Promise.all([loadSessions(resolvedUserId), loadAudit(resolvedUserId)])
      }
      return true
    } catch (error) {
      console.error(error)
      return error instanceof Error ? error.message : 'User deactivation failed'
    } finally {
      setOperationLoading(false)
    }
  }

  const revokeSession = async (sessionId: string) => {
    setOperationLoading(true)
    setPageError(null)
    try {
      const response = await fetch(`/api/admin/security/sessions/${sessionId}`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to revoke session')
      }

      toast.success('Session revoked')
      if (selectedUserId) {
        await Promise.all([
          loadSessions(selectedUserId),
          loadAudit(selectedUserId),
          loadUsers(query),
        ])
      }
    } catch (error) {
      console.error(error)
      setPageError(error instanceof Error ? error.message : 'Session revoke failed')
    } finally {
      setOperationLoading(false)
    }
  }

  const revokeAllSessionsForUser = async (userId: string) => {
    setOperationLoading(true)
    setPageError(null)
    try {
      const response = await fetch(`/api/admin/security/users/${userId}/sessions`, {
        method: 'DELETE',
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to revoke all sessions')
      }

      toast.success(
        payload?.revokedSessions > 0
          ? `${payload.revokedSessions} session${payload.revokedSessions === 1 ? '' : 's'} revoked`
          : 'No active sessions to revoke'
      )

      if (selectedUserId) {
        await Promise.all([
          loadSessions(selectedUserId),
          loadAudit(selectedUserId),
          loadUsers(query),
        ])
      }
    } catch (error) {
      console.error(error)
      setPageError(error instanceof Error ? error.message : 'Bulk session revoke failed')
    } finally {
      setOperationLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading security console...
        </div>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="w-full p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Access denied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Only system administrators can access the security console.
            </p>
            <Button onClick={() => router.push('/')}>Back to workspace</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader
        title="Security & access"
        description="Manage authentication policy, active sessions, account access, and the administrative audit trail."
        meta={
          <Badge variant="outline" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            Live controls
          </Badge>
        }
        actions={
          <Button size="sm" variant="outline" onClick={refreshAll} disabled={isRefreshing || operationLoading} loading={isRefreshing}>
            {!isRefreshing ? <RefreshCcw /> : null}
            Refresh data
          </Button>
        }
      />

      <PageBody className="space-y-4">
        {pageError ? (
          <InlineAlert
            tone="danger"
            title="Security action not completed."
            action={<Button size="sm" variant="outline" onClick={() => void refreshAll()}>Retry refresh</Button>}
          >
            {pageError}
          </InlineAlert>
        ) : null}

        <MetricRow>
          <Metric label="Active accounts" value={activeUsers} hint={`${users.length} total account${users.length === 1 ? '' : 's'}`} icon={Users} />
          <Metric
            label="MFA protected"
            value={`${mfaProtectedUsers}/${activeUsers}`}
            hint={activeUsers > 0 ? `${Math.round((mfaProtectedUsers / activeUsers) * 100)}% coverage` : 'No active accounts'}
            tone={mfaAttentionCount > 0 ? 'warning' : 'success'}
            icon={Shield}
          />
          <Metric label="Active sessions" value={activeSessionCount} hint="Across all visible accounts" icon={MonitorSmartphone} />
          <Metric
            label="Needs attention"
            value={mfaAttentionCount}
            hint="Active accounts without MFA"
            tone={mfaAttentionCount > 0 ? 'danger' : 'success'}
            icon={ShieldAlert}
          />
        </MetricRow>

        <div className="grid min-h-[640px] gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Panel className="overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start">
            <PanelHeader
              title="User directory"
              description={`${users.length} account${users.length === 1 ? '' : 's'} in this result`}
              icon={Users}
            />
            <PanelBody padded={false} className="flex min-h-0 flex-col">
              <div className="border-b border-border p-3">
                <Label htmlFor="security-user-search" className="sr-only">Search users</Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="security-user-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search name or email"
                      className="pl-8"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void loadUsers(query)
                        }
                      }}
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void loadUsers(query)} disabled={isRefreshing || operationLoading}>
                    Search
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {users.map((user) => {
                  const selected = selectedUserId === user.id
                  const initials = user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUserId(user.id)}
                      aria-current={selected ? 'true' : undefined}
                      className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2.5 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                        selected ? 'bg-primary-muted shadow-[inset_2px_0_0_var(--primary)]' : 'hover:bg-surface-hover'
                      }`}
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-surface-sunken text-[10px] font-semibold text-muted-foreground">
                          {initials || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-foreground">{user.name}</span>
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${user.isActive ? 'bg-success' : 'bg-muted-foreground/45'}`}
                            title={user.isActive ? 'Active account' : 'Offboarded account'}
                          />
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">{user.email}</span>
                        <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="capitalize">{user.globalRole}</span>
                          <span aria-hidden="true">•</span>
                          <span>{user.activeSessions} active session{user.activeSessions === 1 ? '' : 's'}</span>
                        </span>
                      </span>
                      {user.isActive && (user.mfaEnabled || user.mfaReenrollRequired) ? (
                        <Shield className="mt-0.5 size-3.5 shrink-0 text-success" aria-label="MFA protected" />
                      ) : null}
                    </button>
                  )
                })}

                {users.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <Users className="mx-auto size-5 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">No users found</p>
                    <p className="mt-1 text-xs text-muted-foreground">Try a different name or email address.</p>
                  </div>
                ) : null}
              </div>
            </PanelBody>
          </Panel>

          <div className="min-w-0 space-y-4">
            {selectedUser ? (
              <>
                <Panel>
                  <PanelHeader
                    title={selectedUser.name}
                    description={selectedUser.email}
                    icon={UserCheck}
                    actions={
                      <div className="flex items-center gap-2">
                        {selectedUser.isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="hidden sm:inline-flex"
                            onClick={() => void updateMfaPolicyForUser(
                              selectedUser.id,
                              selectedUser.mfaEnabled || selectedUser.mfaReenrollRequired ? 'disable' : 'enable'
                            )}
                            disabled={operationLoading}
                          >
                            <Shield />
                            {selectedUser.mfaEnabled || selectedUser.mfaReenrollRequired ? 'Disable MFA' : 'Require MFA'}
                          </Button>
                        ) : null}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={operationLoading}>
                              <Ellipsis />
                              Security actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuItem
                              disabled={!selectedUser.isActive}
                              onSelect={() => void updateMfaPolicyForUser(
                                selectedUser.id,
                                selectedUser.mfaEnabled || selectedUser.mfaReenrollRequired ? 'disable' : 'enable'
                              )}
                            >
                              <Shield />
                              {selectedUser.mfaEnabled || selectedUser.mfaReenrollRequired ? 'Disable MFA policy' : 'Require MFA'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={!selectedUser.isActive} onSelect={() => void resetMfaForUser(selectedUser.id, false)}>
                              <KeyRound />
                              Reset MFA enrollment
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!selectedUser.isActive} onSelect={() => void resetMfaForUser(selectedUser.id, true)}>
                              <ShieldAlert />
                              Reset MFA and revoke sessions
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!selectedUser.isActive || selectedUser.activeSessions === 0}
                              onSelect={() => void revokeAllSessionsForUser(selectedUser.id)}
                            >
                              <XCircle />
                              Revoke all sessions
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" disabled={!selectedUser.isActive} onSelect={() => accessRemoval.request(selectedUser)}>
                              <Trash2 />
                              Remove user access
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    }
                  />
                  <PanelBody>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={selectedUser.isActive ? 'outline' : 'destructive'}
                        className={selectedUser.isActive ? 'border-success-border bg-success-bg text-success' : ''}
                      >
                        {selectedUser.isActive ? 'Active account' : 'Access removed'}
                      </Badge>
                      <Badge variant="outline" className="capitalize">{selectedUser.globalRole}</Badge>
                      {selectedUser.mfaReenrollRequired ? (
                        <Badge className="border-0 bg-warning-bg text-warning">MFA re-enrollment required</Badge>
                      ) : selectedUser.mfaEnabled ? (
                        <Badge className="border-0 bg-success-bg text-success">MFA enrolled</Badge>
                      ) : (
                        <Badge variant="outline">MFA not enrolled</Badge>
                      )}
                    </div>

                    <dl className="mt-4 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
                      <div className="bg-card px-3 py-2.5">
                        <dt className="type-label">Last seen</dt>
                        <dd className="mt-1 text-xs font-medium text-foreground">{formatDateTime(selectedUser.lastSeenAt)}</dd>
                      </div>
                      <div className="bg-card px-3 py-2.5">
                        <dt className="type-label">Active sessions</dt>
                        <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">{selectedUser.activeSessions}</dd>
                      </div>
                      <div className="bg-card px-3 py-2.5">
                        <dt className="type-label">MFA enrolled</dt>
                        <dd className="mt-1 text-xs font-medium text-foreground">{formatDateTime(selectedUser.mfaEnabledAt)}</dd>
                      </div>
                    </dl>
                  </PanelBody>
                </Panel>

                <Tabs defaultValue="sessions" className="gap-0">
                  <Panel className="overflow-hidden">
                    <div className="border-b border-border px-3.5 pt-1">
                      <TabsList>
                        <TabsTrigger value="sessions">
                          <MonitorSmartphone /> Sessions
                          <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{sessions.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="audit">
                          <History /> Audit trail
                          <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{auditEvents.length}</Badge>
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="sessions" className="mt-0">
                      {sessionsLoading ? (
                        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" /> Loading sessions…
                        </div>
                      ) : sessions.length === 0 ? (
                        <div className="p-10 text-center">
                          <MonitorSmartphone className="mx-auto size-5 text-muted-foreground" />
                          <p className="mt-2 text-sm font-medium">No session history</p>
                          <p className="mt-1 text-xs text-muted-foreground">This account has no recorded sessions.</p>
                        </div>
                      ) : (
                        <Table density="comfortable" containerClassName="max-h-[520px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Device</TableHead>
                              <TableHead>Assurance</TableHead>
                              <TableHead>Activity</TableHead>
                              <TableHead align="right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sessions.map((session) => (
                              <TableRow key={session.id}>
                                <TableCell className="min-w-[220px]">
                                  <div className="font-medium">{session.deviceLabel || 'Unknown device'}</div>
                                  <div className="mt-0.5 text-[11px] text-muted-foreground">{session.ipAddress || 'IP unavailable'}</div>
                                  <div className="max-w-[320px] truncate text-[11px] text-muted-foreground" title={session.userAgent || ''}>
                                    {session.userAgent || 'User agent unavailable'}
                                  </div>
                                </TableCell>
                                <TableCell className="min-w-[150px]">
                                  <div className="flex flex-wrap gap-1">
                                    {session.revokedAt ? (
                                      <Badge variant="outline" className="border-danger-border bg-danger-bg text-foreground">Revoked</Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-success-border bg-success-bg text-success">Active</Badge>
                                    )}
                                    {session.mfaBypassed ? (
                                      <Badge className="border-0 bg-warning-bg text-warning">MFA bypassed</Badge>
                                    ) : session.mfaVerifiedAt ? (
                                      <Badge variant="outline">MFA verified</Badge>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell className="min-w-[210px] text-xs text-muted-foreground">
                                  <div>Last seen {formatDateTime(session.lastSeenAt)}</div>
                                  <div>Expires {formatDateTime(session.expiresAt)}</div>
                                  {session.revokedAt ? <div className="text-danger">Revoked {formatDateTime(session.revokedAt)}</div> : null}
                                </TableCell>
                                <TableCell align="right">
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    disabled={operationLoading || Boolean(session.revokedAt) || !selectedUser.isActive}
                                    onClick={() => void revokeSession(session.id)}
                                  >
                                    <XCircle /> Revoke
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </TabsContent>

                    <TabsContent value="audit" className="mt-0">
                      {auditLoading ? (
                        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" /> Loading audit trail…
                        </div>
                      ) : auditEvents.length === 0 ? (
                        <div className="p-10 text-center">
                          <History className="mx-auto size-5 text-muted-foreground" />
                          <p className="mt-2 text-sm font-medium">No security events</p>
                          <p className="mt-1 text-xs text-muted-foreground">Administrative actions for this account will appear here.</p>
                        </div>
                      ) : (
                        <ol className="max-h-[520px] overflow-y-auto p-4">
                          {auditEvents.map((event, index) => {
                            const details = describeAuditDetails(event)
                            return (
                              <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                                {index < auditEvents.length - 1 ? (
                                  <span className="absolute left-[5px] top-3 h-full w-px bg-border" aria-hidden="true" />
                                ) : null}
                                <span className="relative mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <p className="text-[13px] font-medium">{formatAuditAction(event.action)}</p>
                                    <time className="text-[11px] text-muted-foreground">{formatDateTime(event.createdAt)}</time>
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    By {event.actorUser?.name || event.actorUser?.email || 'Unknown administrator'}
                                    {details ? ` • ${details}` : ''}
                                  </p>
                                </div>
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </TabsContent>
                  </Panel>
                </Tabs>
              </>
            ) : (
              <Panel className="min-h-[420px]">
                <PanelBody className="flex flex-col items-center justify-center text-center">
                  <UserCheck className="size-6 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">Select an account</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Choose a user to inspect authentication status, revoke sessions, or review administrative changes.
                  </p>
                </PanelBody>
              </Panel>
            )}
          </div>
        </div>
      </PageBody>

      <ConfirmDestructiveDialog
        open={accessRemoval.isOpen}
        onOpenChange={accessRemoval.onOpenChange}
        title={`Remove access for ${accessRemoval.target?.name ?? 'this user'}?`}
        description="This deactivates the account, revokes every session, removes all project memberships, and clears active work-item assignments."
        confirmLabel="Remove user access"
        onConfirm={() => accessRemoval.target ? deactivateUser(accessRemoval.target.id) : false}
      />
    </div>
  )
}
