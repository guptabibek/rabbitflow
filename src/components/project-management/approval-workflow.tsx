'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'

const MAX_REQUIRED_APPROVALS = 20
const MAX_APPROVAL_REASON_LENGTH = 2000
const MAX_ASSIGNED_APPROVERS = 20

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApprovalRequest {
  id: string
  issueId: string
  requestedById: string
  status: 'pending' | 'approved' | 'rejected'
  requiredApprovals: number
  approvalCount: number
  rejectionCount: number
  reason?: string | null
  createdAt: string
  resolvedAt: string | null
  approverUserIds?: string[]
  approvers?: Array<{
    id: string
    name: string
    email: string
  }>
  canCurrentUserDecide?: boolean
  issue?: {
    id: string
    title: string
    key?: string
    identifier?: string
  }
  requestedBy?: {
    id: string
    name: string
    avatar: string | null
  }
  decisions?: ApprovalDecision[]
}

interface ApprovalDecision {
  id: string
  approvalId: string
  userId: string
  decision: 'approved' | 'rejected'
  comment: string | null
  createdAt: string
  user?: {
    id: string
    name: string
    avatar: string | null
  }
}

interface ApprovalPanelProps {
  issueId: string
  transitions?: Array<{
    id: string
    fromStateId: string
    toStateId: string
    label: string
    requiresApproval: boolean
    approverRoles: string[] | null
    minApprovals: number
  }>
  requestPrefill?: {
    token: number
    transitionId?: string | null
    requiredApprovals?: number | null
    reason?: string
  } | null
}

// ---------------------------------------------------------------------------
// Component - Inline panel for issue detail
// ---------------------------------------------------------------------------

export function ApprovalPanel({ issueId, transitions = [], requestPrefill = null }: ApprovalPanelProps) {
  const { currentUser, currentProjectPermissions, users } = useAppStore()
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [decisionOpen, setDecisionOpen] = useState<ApprovalRequest | null>(null)
  const [saving, setSaving] = useState(false)

  const [requiredCount, setRequiredCount] = useState('1')
  const [selectedTransitionId, setSelectedTransitionId] = useState<string>('none')
  const [requestReason, setRequestReason] = useState('')
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([])
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [comment, setComment] = useState('')
  const canRequestApproval = currentProjectPermissions.includes('workitem:update')
  const availableApprovers = users.filter((user) => user.id !== currentUser?.id)
  const selectedTransition =
    selectedTransitionId === 'none'
      ? null
      : transitions.find((transition) => transition.id === selectedTransitionId) ?? null

  useEffect(() => {
    if (!selectedTransition) return
    setRequiredCount(String(selectedTransition.minApprovals || 1))
  }, [selectedTransition])

  useEffect(() => {
    if (!requestPrefill) {
      return
    }

    const nextTransitionId =
      requestPrefill.transitionId &&
      transitions.some((transition) => transition.id === requestPrefill.transitionId)
        ? requestPrefill.transitionId
        : 'none'

    const matchedTransition =
      nextTransitionId === 'none'
        ? null
        : transitions.find((transition) => transition.id === nextTransitionId) ?? null

    setSelectedTransitionId(nextTransitionId)
    setRequiredCount(
      String(requestPrefill.requiredApprovals ?? matchedTransition?.minApprovals ?? 1)
    )
    setRequestReason(requestPrefill.reason ?? '')
    setSelectedApproverIds([])
    setRequestOpen(true)
  }, [requestPrefill, transitions])

  const fetchApprovals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/approvals?issueId=${issueId}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load approvals'))
      }

      const data = await res.json()
      setApprovals(data.approvals ?? data)
      setLoadError(null)
    } catch (error) {
      setApprovals([])
      setLoadError(error instanceof Error ? error.message : 'Failed to load approvals')
    } finally {
      setLoading(false)
    }
  }, [issueId])

  useEffect(() => { fetchApprovals() }, [fetchApprovals])

  const handleRequest = async () => {
    const parsedRequiredCount = Number.parseInt(requiredCount, 10)

    if (!Number.isInteger(parsedRequiredCount) || parsedRequiredCount < 1 || parsedRequiredCount > MAX_REQUIRED_APPROVALS) {
      toast.error(`Required approvals must be between 1 and ${MAX_REQUIRED_APPROVALS}.`)
      return
    }

    if (requestReason.trim().length > MAX_APPROVAL_REASON_LENGTH) {
      toast.error(`Approval reason cannot exceed ${MAX_APPROVAL_REASON_LENGTH} characters.`)
      return
    }

    if (selectedApproverIds.length > MAX_ASSIGNED_APPROVERS) {
      toast.error(`You can assign up to ${MAX_ASSIGNED_APPROVERS} approvers.`)
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId,
          requiredApprovals: parsedRequiredCount,
          transitionId: selectedTransition?.id,
          reason: requestReason.trim() || undefined,
          approverUserIds: selectedApproverIds.length > 0 ? selectedApproverIds : undefined,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to request approval'))
      }

      setRequestOpen(false)
      setSelectedTransitionId('none')
      setRequestReason('')
      setSelectedApproverIds([])
      await fetchApprovals()
      toast.success('Approval requested')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to request approval')
    } finally {
      setSaving(false)
    }
  }

  const handleDecision = async () => {
    if (!decisionOpen) return
    setSaving(true)
    try {
      const res = await fetch(`/api/approvals/${decisionOpen.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          comment: comment || undefined,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to submit approval decision'))
      }

      setDecisionOpen(null)
      setComment('')
      await fetchApprovals()
      toast.success(decision === 'approved' ? 'Approval recorded' : 'Rejection recorded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit approval decision')
    } finally {
      setSaving(false)
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      case 'rejected':
        return <XCircle className="h-3.5 w-3.5 text-red-500" />
      default:
        return <Clock className="h-3.5 w-3.5 text-yellow-500" />
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Approvals
        </h4>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => setRequestOpen(true)}
          disabled={!canRequestApproval}
        >
          Request
        </Button>
      </div>

      {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}

      {loading ? (
        <Skeleton className="h-8 w-full" />
      ) : approvals.length === 0 ? (
        <p className="text-xs text-muted-foreground">No approval requests.</p>
      ) : (
        <div className="space-y-2">
          {approvals.map((approval) => (
            <div key={approval.id} className="rounded-md border p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                {statusIcon(approval.status)}
                <Badge
                  variant={
                    approval.status === 'approved'
                      ? 'default'
                      : approval.status === 'rejected'
                      ? 'destructive'
                      : 'secondary'
                  }
                  className="text-[10px]"
                >
                  {approval.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {approval.approvalCount}/{approval.requiredApprovals} approvals
                </span>
              </div>

              {approval.reason && (
                <div className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                  {approval.reason}
                </div>
              )}

              {approval.approvers && approval.approvers.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-5">
                  {approval.approvers.map((approver) => (
                    <Badge key={approver.id} variant="outline" className="text-[10px]">
                      {approver.name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Decisions */}
              {approval.decisions && approval.decisions.length > 0 && (
                <div className="space-y-1 pl-5">
                  {approval.decisions.map((d) => (
                    <div key={d.id} className="flex items-center gap-1.5 text-xs">
                      {d.decision === 'approved' ? (
                        <ThumbsUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <ThumbsDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className="font-medium">{d.user?.name ?? 'User'}</span>
                      {d.comment && (
                        <span className="text-muted-foreground truncate">— {d.comment}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {approval.status === 'pending' && approval.canCurrentUserDecide && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs mt-1"
                  onClick={() => {
                    setDecisionOpen(approval)
                    setDecision('approved')
                    setComment('')
                  }}
                >
                  Review
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Request dialog */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Approval</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {transitions.length > 0 && (
              <div className="space-y-1.5">
                <Label>Transition</Label>
                <Select value={selectedTransitionId} onValueChange={setSelectedTransitionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="General approval request" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">General approval request</SelectItem>
                    {transitions.map((transition) => (
                      <SelectItem key={transition.id} value={transition.id}>
                        {transition.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTransition?.requiresApproval ? (
                  <p className="text-xs text-muted-foreground">
                    Policy requires at least {selectedTransition.minApprovals} approval{selectedTransition.minApprovals === 1 ? '' : 's'}.
                    {selectedTransition.approverRoles && selectedTransition.approverRoles.length > 0
                      ? ` Preferred approver roles: ${selectedTransition.approverRoles.join(', ')}.`
                      : ' If no approvers are assigned manually, Admin, PM, and DevOps reviewers are used by default.'}
                  </p>
                ) : null}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Required Approvals</Label>
              <Select value={requiredCount} onValueChange={setRequiredCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: MAX_REQUIRED_APPROVALS }, (_, index) => index + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} approval{n !== 1 ? 's' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                value={requestReason}
                onChange={(event) => setRequestReason(event.target.value)}
                rows={3}
                placeholder="Explain the change that needs approval."
                maxLength={MAX_APPROVAL_REASON_LENGTH}
              />
              <p className="text-right text-xs text-muted-foreground">
                {requestReason.length}/{MAX_APPROVAL_REASON_LENGTH}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Assigned Approvers</Label>
              <ScrollArea className="max-h-36 rounded-md border">
              {selectedTransition?.requiresApproval ? (
                <p className="text-xs text-muted-foreground">
                  This request will be validated against the transition policy during state change.
                </p>
              ) : null}
                <div className="space-y-1 p-2">
                  {availableApprovers.map((user) => {
                    const isSelected = selectedApproverIds.includes(user.id)
                    const limitReached = selectedApproverIds.length >= MAX_ASSIGNED_APPROVERS
                    return (
                      <label
                        key={user.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isSelected && limitReached}
                          onChange={(event) => {
                            setSelectedApproverIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, user.id])]
                                : current.filter((id) => id !== user.id)
                            )
                          }}
                        />
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={user.avatar || undefined} />
                          <AvatarFallback>
                            {user.name
                              .split(' ')
                              .map((part) => part[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate">{user.name}</span>
                        <span className="text-xs text-muted-foreground">{user.projectRole ?? 'Member'}</span>
                      </label>
                    )
                  })}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                Leave this blank to auto-route to Admin, PM, or DevOps approvers. Up to {MAX_ASSIGNED_APPROVERS} approvers can be assigned.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button onClick={handleRequest} disabled={saving}>
              {saving ? 'Requesting…' : 'Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision dialog */}
      <Dialog open={!!decisionOpen} onOpenChange={() => setDecisionOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Approval</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Decision</Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as typeof decision)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve</SelectItem>
                  <SelectItem value="rejected">Reject</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Comment (optional)</Label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Reason for your decision…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionOpen(null)}>Cancel</Button>
            <Button onClick={handleDecision} disabled={saving}>
              {saving ? 'Submitting…' : decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standalone page view — pending approvals dashboard
// ---------------------------------------------------------------------------

export function ApprovalDashboard() {
  const { currentProject } = useAppStore()
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const url = currentProject
        ? `/api/approvals?pending=true&projectId=${currentProject.id}`
        : '/api/approvals?pending=true'
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load pending approvals'))
      }

      const data = await res.json()
      setApprovals(data.approvals ?? data)
      setLoadError(null)
    } catch (error) {
      setApprovals([])
      setLoadError(error instanceof Error ? error.message : 'Failed to load pending approvals')
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  useEffect(() => { fetchPending() }, [fetchPending])

  return (
    <div className="flex h-full flex-col gap-4 p-4 overflow-auto">
      <div>
        <h2 className="text-lg font-semibold">Pending Approvals</h2>
        <p className="text-sm text-muted-foreground">
          Items waiting for your review.
        </p>
        {loadError ? <p className="mt-2 text-sm text-destructive">{loadError}</p> : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : approvals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ShieldCheck className="mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">No pending approvals</p>
            <p className="text-sm">You&apos;re all caught up.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {approvals.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <Clock className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {a.issue?.key ?? a.issue?.identifier ?? a.issueId}
                    </span>
                    <span className="text-sm text-muted-foreground truncate">
                      {a.issue?.title ?? 'Work item'}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Requested by {a.requestedBy?.name ?? 'someone'}
                    </span>
                    <span>
                      {a.approvalCount}/{a.requiredApprovals} approvals
                    </span>
                    <span>{new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Pending
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
