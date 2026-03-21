'use client'

import { useEffect, useMemo, useState } from 'react'
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
  if (!event.details || typeof event.details !== 'object') return null
  const details = event.details as Record<string, unknown>
  const revokedSessions = details.revokedSessions
  if (typeof revokedSessions === 'number') {
    return `${revokedSessions} session${revokedSessions === 1 ? '' : 's'} affected`
  }
  if (typeof details.sessionId === 'string') return `Session: ${details.sessionId}`
  return null
}

export function AdminSecurityView() {
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
    if (nextSelectedUserId !== selectedUserId) setSelectedUserId(nextSelectedUserId)
    return nextSelectedUserId
  }

  const loadSessions = async (userId: string) => {
    setSessionsLoading(true)
    try {
      const response = await fetch(`/api/admin/security/users/${userId}/sessions`, { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to load user sessions')
      }
      const payload = await response.json()
      setSessions(Array.isArray(payload?.sessions) ? payload.sessions : [])
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
      const response = await fetch(`/api/admin/security/users/${userId}/audit?limit=100`, { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to load security timeline')
      }
      const payload = await response.json()
      setAuditEvents(Array.isArray(payload?.events) ? payload.events : [])
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
        if (!meRes.ok) return
        const me = await meRes.json()
        if (me?.globalRole !== 'admin') {
          setAccessDenied(true)
          setIsLoading(false)
          return
        }
        await loadUsers('', false)
      } catch (error) {
        console.error(error)
        toast.error('Failed to initialize admin security')
      } finally {
        setIsLoading(false)
      }
    }
    void initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      if (resolvedUserId) await Promise.all([loadSessions(resolvedUserId), loadAudit(resolvedUserId)])
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
      if (!response.ok) throw new Error(payload?.error || 'Failed to reset MFA')
      toast.success(payload?.message || 'MFA reset completed')
      const resolvedUserId = await loadUsers(query)
      if (resolvedUserId) await Promise.all([loadSessions(resolvedUserId), loadAudit(resolvedUserId)])
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
      const response = await fetch(`/api/admin/security/sessions/${sessionId}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Failed to revoke session')
      toast.success('Session revoked')
      if (selectedUserId) await Promise.all([loadSessions(selectedUserId), loadAudit(selectedUserId), loadUsers(query)])
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
      const response = await fetch(`/api/admin/security/users/${userId}/sessions`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Failed to revoke all sessions')
      toast.success(
        payload?.revokedSessions > 0
          ? `${payload.revokedSessions} session${payload.revokedSessions === 1 ? '' : 's'} revoked`
          : 'No active sessions to revoke'
      )
      if (selectedUserId) await Promise.all([loadSessions(selectedUserId), loadAudit(selectedUserId), loadUsers(query)])
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Bulk session revoke failed')
    } finally {
      setOperationLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading security console...
        </div>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader><CardTitle className="text-lg">Access denied</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Only system administrators can access the security console.</p></CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Admin Security Console</h2>
          <p className="text-xs text-muted-foreground">Force MFA re-enrollment, revoke sessions, review audit timeline.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={isRefreshing || operationLoading}>
          {isRefreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-2 p-4">
            <CardTitle className="text-sm">Users</CardTitle>
            <div className="space-y-1">
              <Label htmlFor="security-user-search" className="text-[11px] text-muted-foreground">Search users</Label>
              <Input
                id="security-user-search"
                className="h-8 text-xs"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or email"
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void loadUsers(query) } }}
              />
            </div>
            <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => void loadUsers(query)} disabled={isRefreshing || operationLoading}>
              Apply Filter
            </Button>
          </CardHeader>
          <CardContent className="max-h-[60vh] overflow-auto p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-1.5">User</th>
                  <th className="px-3 py-1.5">MFA</th>
                  <th className="px-3 py-1.5">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelected = selectedUserId === user.id
                  return (
                    <tr key={user.id} className={`cursor-pointer border-b transition-colors hover:bg-muted/40 ${isSelected ? 'bg-muted/60' : ''}`} onClick={() => setSelectedUserId(user.id)}>
                      <td className="px-3 py-1.5 align-top">
                        <div className="font-medium text-xs">{user.name}</div>
                        <div className="text-[11px] text-muted-foreground">{user.email}</div>
                      </td>
                      <td className="px-3 py-1.5 align-top">
                        {user.mfaEnabled ? <Badge className="bg-category-done-bg text-category-done border-0 text-[10px]">On</Badge> : <Badge variant="outline" className="text-[10px]">Off</Badge>}
                        {user.mfaReenrollRequired ? <div className="mt-0.5"><Badge className="bg-status-in-review-bg text-status-in-review border-0 text-[10px]">Re-enroll</Badge></div> : null}
                      </td>
                      <td className="px-3 py-1.5 align-top text-xs">{user.activeSessions}</td>
                    </tr>
                  )
                })}
                {users.length === 0 ? <tr><td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">No users found.</td></tr> : null}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 p-4">
              <div>
                <CardTitle className="text-sm">Sessions & Devices</CardTitle>
                {selectedUser ? <p className="text-[11px] text-muted-foreground mt-0.5">{selectedUser.name} ({selectedUser.email})</p> : null}
              </div>
              {selectedUser ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => void resetMfaForUser(selectedUser.id, true)} disabled={operationLoading}>
                    <ShieldAlert className="mr-1 h-3 w-3" />Reset MFA + Revoke
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void resetMfaForUser(selectedUser.id, false)} disabled={operationLoading}>
                    <Shield className="mr-1 h-3 w-3" />MFA Only
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void revokeAllSessionsForUser(selectedUser.id)} disabled={operationLoading}>
                    <XCircle className="mr-1 h-3 w-3" />Revoke All
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              {sessionsLoading ? (
                <div className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sessions...</div>
              ) : !selectedUser ? (
                <div className="p-4 text-xs text-muted-foreground">Select a user to view sessions.</div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">No sessions found.</div>
              ) : (
                <div className="max-h-[40vh] overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-1.5">Device</th>
                        <th className="px-3 py-1.5">Security</th>
                        <th className="px-3 py-1.5">Times</th>
                        <th className="px-3 py-1.5">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((session) => (
                        <tr key={session.id} className="border-b align-top">
                          <td className="px-3 py-1.5">
                            <div className="font-medium">{session.deviceLabel || 'Unknown device'}</div>
                            <div className="text-[11px] text-muted-foreground">IP: {session.ipAddress || 'N/A'}</div>
                          </td>
                          <td className="px-3 py-1.5 space-y-0.5">
                            {session.revokedAt ? <Badge variant="outline" className="text-destructive border-destructive/40 text-[10px]">Revoked</Badge> : <Badge className="bg-category-done-bg text-category-done border-0 text-[10px]">Active</Badge>}
                            {session.mfaBypassed ? <div><Badge className="bg-status-in-review-bg text-status-in-review border-0 text-[10px]">MFA bypassed</Badge></div> : null}
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-muted-foreground space-y-0.5">
                            <div>Created: {formatDateTime(session.createdAt)}</div>
                            <div>Last seen: {formatDateTime(session.lastSeenAt)}</div>
                          </td>
                          <td className="px-3 py-1.5">
                            <Button size="sm" variant="outline" className="h-6 text-[11px]" disabled={operationLoading || Boolean(session.revokedAt)} onClick={() => void revokeSession(session.id)}>
                              <XCircle className="mr-1 h-3 w-3" />Revoke
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
            <CardHeader className="p-4">
              <CardTitle className="text-sm">Audit Timeline</CardTitle>
              {selectedUser ? <p className="text-[11px] text-muted-foreground mt-0.5">Security events for {selectedUser.name}</p> : null}
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {auditLoading ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...</div>
              ) : !selectedUser ? (
                <div className="text-xs text-muted-foreground">Select a user to view audit timeline.</div>
              ) : auditEvents.length === 0 ? (
                <div className="text-xs text-muted-foreground">No security events recorded.</div>
              ) : (
                <div className="max-h-[24vh] space-y-1.5 overflow-auto pr-1">
                  {auditEvents.map((event) => {
                    const details = describeAuditDetails(event)
                    return (
                      <div key={event.id} className="rounded border bg-muted/20 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-medium">{formatAuditAction(event.action)}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">By {event.actorUser?.name || 'Unknown admin'}</div>
                            {details ? <div className="text-[11px] text-muted-foreground mt-0.5">{details}</div> : null}
                          </div>
                          <div className="text-[11px] text-muted-foreground whitespace-nowrap">{formatDateTime(event.createdAt)}</div>
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

      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <History className="h-3 w-3" />
        Use reset and revoke controls to enforce re-enrollment and terminate risky sessions instantly.
      </div>
    </div>
  )
}
