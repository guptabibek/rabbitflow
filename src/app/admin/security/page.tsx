'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { History, Loader2, RefreshCcw, Shield, ShieldAlert, XCircle } from 'lucide-react'

type SecurityUser = {
  id: string
  name: string
  email: string
  globalRole: string
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
    case 'MFA_RESET_ONLY':
      return 'MFA reset (sessions preserved)'
    case 'MFA_RESET_WITH_SESSION_REVOKE':
      return 'MFA reset and sessions revoked'
    case 'SESSION_REVOKED':
      return 'Single session revoked'
    case 'SESSIONS_REVOKED_ALL':
      return 'All sessions revoked'
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

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId]
  )

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
      toast.error(error instanceof Error ? error.message : 'Failed to load sessions')
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }

  const loadAudit = async (userId: string) => {
    setAuditLoading(true)
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
      toast.error(error instanceof Error ? error.message : 'Failed to load security timeline')
      setAuditEvents([])
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
        toast.error('Failed to initialize admin security page')
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
    try {
      const resolvedUserId = await loadUsers(query)
      if (resolvedUserId) {
        await Promise.all([loadSessions(resolvedUserId), loadAudit(resolvedUserId)])
      }
      toast.success('Security data refreshed')
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Refresh failed')
    } finally {
      setIsRefreshing(false)
    }
  }

  const resetMfaForUser = async (userId: string, revokeSessions: boolean) => {
    setOperationLoading(true)
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
      toast.error(error instanceof Error ? error.message : 'MFA reset failed')
    } finally {
      setOperationLoading(false)
    }
  }

  const revokeSession = async (sessionId: string) => {
    setOperationLoading(true)
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
      toast.error(error instanceof Error ? error.message : 'Session revoke failed')
    } finally {
      setOperationLoading(false)
    }
  }

  const revokeAllSessionsForUser = async (userId: string) => {
    setOperationLoading(true)
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
      toast.error(error instanceof Error ? error.message : 'Bulk session revoke failed')
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
      <div className="mx-auto max-w-3xl p-6">
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
    <div className="mx-auto w-full max-w-[1440px] p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Security Console</h1>
          <p className="text-sm text-muted-foreground">
            Force MFA re-enrollment, revoke sessions in bulk, and review a full security action timeline.
          </p>
        </div>
        <Button variant="outline" onClick={refreshAll} disabled={isRefreshing || operationLoading}>
          {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[460px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Users</CardTitle>
            <div className="space-y-1.5">
              <Label htmlFor="security-user-search" className="text-xs text-muted-foreground">Search users</Label>
              <Input
                id="security-user-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or email"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void loadUsers(query)
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void loadUsers(query)}
              disabled={isRefreshing || operationLoading}
            >
              Apply Filter
            </Button>
          </CardHeader>
          <CardContent className="max-h-[70vh] overflow-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">MFA</th>
                  <th className="px-3 py-2">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelected = selectedUserId === user.id
                  return (
                    <tr
                      key={user.id}
                      className={`cursor-pointer border-b transition-colors hover:bg-muted/40 ${isSelected ? 'bg-muted/60' : ''}`}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">Role: {user.globalRole}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {user.mfaEnabled ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-0">Enabled</Badge>
                        ) : (
                          <Badge variant="outline">Disabled</Badge>
                        )}
                        {user.mfaReenrollRequired ? (
                          <div className="mt-1">
                            <Badge className="bg-amber-500/10 text-amber-600 border-0">Re-enroll required</Badge>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div>{user.activeSessions}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDateTime(user.lastSeenAt)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Sessions & Devices</CardTitle>
                {selectedUser ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedUser.name} ({selectedUser.email})
                  </p>
                ) : null}
              </div>
              {selectedUser ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void resetMfaForUser(selectedUser.id, true)}
                    disabled={operationLoading}
                  >
                    {operationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                    Reset MFA + Revoke Sessions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void resetMfaForUser(selectedUser.id, false)}
                    disabled={operationLoading}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Reset MFA Only
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void revokeAllSessionsForUser(selectedUser.id)}
                    disabled={operationLoading}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Revoke All Sessions
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              {sessionsLoading ? (
                <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions...
                </div>
              ) : !selectedUser ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Select a user to view enrolled devices and sessions.
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No sessions found for selected user.</div>
              ) : (
                <div className="max-h-[50vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">Device</th>
                        <th className="px-3 py-2">Security</th>
                        <th className="px-3 py-2">Times</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((session) => (
                        <tr key={session.id} className="border-b align-top">
                          <td className="px-3 py-2">
                            <div className="font-medium">{session.deviceLabel || 'Unknown device'}</div>
                            <div className="text-xs text-muted-foreground">IP: {session.ipAddress || 'N/A'}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[320px]" title={session.userAgent || ''}>
                              {session.userAgent || 'No user-agent'}
                            </div>
                          </td>
                          <td className="px-3 py-2 space-y-1">
                            {session.revokedAt ? (
                              <Badge variant="outline" className="text-destructive border-destructive/40">
                                Revoked
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500/10 text-emerald-600 border-0">Active</Badge>
                            )}
                            {session.mfaBypassed ? (
                              <div>
                                <Badge className="bg-amber-500/10 text-amber-600 border-0">MFA bypassed</Badge>
                              </div>
                            ) : null}
                            {session.mfaVerifiedAt ? (
                              <div className="text-[11px] text-muted-foreground">
                                MFA verified: {formatDateTime(session.mfaVerifiedAt)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground space-y-1">
                            <div>Created: {formatDateTime(session.createdAt)}</div>
                            <div>Last seen: {formatDateTime(session.lastSeenAt)}</div>
                            <div>Expires: {formatDateTime(session.expiresAt)}</div>
                            {session.revokedAt ? (
                              <div className="text-destructive">
                                Revoked: {formatDateTime(session.revokedAt)} ({session.revokedReason || 'No reason'})
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={operationLoading || Boolean(session.revokedAt)}
                              onClick={() => void revokeSession(session.id)}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Revoke
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit Timeline</CardTitle>
              {selectedUser ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Who changed security state for {selectedUser.name}, and when.
                </p>
              ) : null}
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading audit timeline...
                </div>
              ) : !selectedUser ? (
                <div className="text-sm text-muted-foreground">
                  Select a user to view audit timeline.
                </div>
              ) : auditEvents.length === 0 ? (
                <div className="text-sm text-muted-foreground">No security events recorded for selected user.</div>
              ) : (
                <div className="max-h-[26vh] space-y-2 overflow-auto pr-1">
                  {auditEvents.map((event) => {
                    const details = describeAuditDetails(event)
                    return (
                      <div key={event.id} className="rounded-md border bg-muted/20 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{formatAuditAction(event.action)}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              By {event.actorUser?.name || event.actorUser?.email || 'Unknown admin'}
                            </div>
                            {details ? (
                              <div className="text-xs text-muted-foreground mt-1">{details}</div>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(event.createdAt)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <History className="h-3.5 w-3.5" />
        Use reset and revoke controls to enforce re-enrollment and terminate risky sessions instantly.
      </div>
    </div>
  )
}
