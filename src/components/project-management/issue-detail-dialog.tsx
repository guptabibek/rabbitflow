'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { DynamicWorkItemFields } from '@/components/project-management/dynamic-work-item-fields'
import { GitLinksPanel } from '@/components/project-management/git-links-panel'
import { ApprovalPanel } from '@/components/project-management/approval-workflow'
import { ConfirmDestructiveDialog, useDestructiveConfirm } from '@/components/project-management/confirm-destructive-dialog'
import { InlineAlert } from '@/components/ui/states'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type {
  Activity,
  Area,
  Comment,
  Issue,
  Iteration,
  State,
  Team,
  User,
  WorkItemTypeDefinition,
} from '@/store/app-store'
import { useAppStore } from '@/store/app-store'
import {
  UNASSIGNED_VALUE,
  buildWorkItemPatchPayload,
  getAvailableWorkItemStates,
  getWorkItemTypeDefinition,
  type WorkItemDraft,
} from '@/lib/domain/work-item-view'
import { workItemPath, workItemUrl } from '@/lib/domain/work-item-url'
import { cn, getApiErrorMessage } from '@/lib/utils'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileIcon,
  GitBranch,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Send,
  Trash2,
  Upload,
} from 'lucide-react'

type RelationLinkType =
  | 'related'
  | 'blocked_by'
  | 'blocks'
  | 'duplicate_of'
  | 'tests'
  | 'tested_by'

type LinkType = RelationLinkType | 'parent' | 'child'

type FlatRelation = {
  id: string
  relationType: RelationLinkType
  direction: 'incoming' | 'outgoing'
  sourceIssueId: string
  targetIssueId: string
  createdAt: string
  linkedIssue: {
    id: string
    key: string
    title: string
    status: string
    workItemType: string
  }
}

type PaginatedResponse<T> = {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

export type WorkItemBootstrapPayload = {
  issue: Issue
  context: {
    users: User[]
    iterations: Iteration[]
    areas: Area[]
    teams: Team[]
    states: State[]
    workItemTypes: WorkItemTypeDefinition[]
    typeStateMappings: Array<{
      workItemTypeId: string
      stateId: string
      order: number
      isInitial: boolean
    }>
    stateTransitions: Array<{
      id: string
      workItemTypeId: string
      fromStateId: string
      toStateId: string
      order: number
      isEnabled: boolean
      requiresApproval: boolean
      approverRoles: string[] | null
      minApprovals: number
    }>
  }
  access: {
    role: string | null
    permissions: string[]
  }
  viewer: User | null
}

type WorkItemDetailContentProps = {
  payload: WorkItemBootstrapPayload
  isRefreshing: boolean
  onReload: () => void
  onIssueUpdated: (issue: Issue) => void
  onDeleted?: () => void
}

type ApprovalRequestPrefill = {
  token: number
  transitionId?: string | null
  requiredApprovals?: number | null
  reason?: string
}

const RELATION_LINK_TYPES: Array<{ value: RelationLinkType; label: string }> = [
  { value: 'related', label: 'Related' },
  { value: 'blocked_by', label: 'Blocked By' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'duplicate_of', label: 'Duplicate Of' },
  { value: 'tests', label: 'Tests' },
  { value: 'tested_by', label: 'Tested By' },
]

const HIERARCHY_LINK_TYPES: Array<{ value: Extract<LinkType, 'parent' | 'child'>; label: string }> = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
]

const LINK_TYPES: Array<{ value: LinkType; label: string }> = [
  ...RELATION_LINK_TYPES,
  ...HIERARCHY_LINK_TYPES,
]

const MAX_STORY_POINTS = 100
const MAX_HOURS = 10000

function sanitizeIntegerInput(value: string, maxDigits = 3) {
  return value.replace(/\D/g, '').slice(0, maxDigits)
}

function sanitizeDecimalInput(value: string, maxIntegerDigits = 5) {
  const sanitized = value.replace(/[^0-9.]/g, '')
  const [integerPart = '', ...fractionParts] = sanitized.split('.')
  const nextIntegerPart = integerPart.slice(0, maxIntegerDigits)

  if (fractionParts.length === 0) {
    return nextIntegerPart
  }

  return `${nextIntegerPart}.${fractionParts.join('')}`
}

function validatePlanningNumber(
  value: string,
  label: string,
  max: number,
  integerOnly = false
) {
  if (!value.trim()) {
    return null
  }

  const parsed = integerOnly ? Number.parseInt(value, 10) : Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    return `${label} must be a valid ${integerOnly ? 'whole number' : 'number'}.`
  }

  if (integerOnly && !Number.isInteger(parsed)) {
    return `${label} must be a whole number.`
  }

  if (parsed < 0 || parsed > max) {
    return `${label} must be between 0 and ${max}.`
  }

  return null
}

function createDraft(issue: Issue): WorkItemDraft {
  return {
    title: issue.title,
    description: issue.description ?? '',
    workItemType: issue.workItemType,
    status: issue.status,
    priority: issue.priority,
    assigneeId: issue.assignee?.id ?? UNASSIGNED_VALUE,
    iterationId: issue.iteration?.id ?? UNASSIGNED_VALUE,
    areaId: issue.area?.id ?? UNASSIGNED_VALUE,
    stateId: issue.stateRecord?.id ?? UNASSIGNED_VALUE,
    parentIssueId: issue.parentIssue?.id ?? issue.parentIssueId ?? UNASSIGNED_VALUE,
    startDate: issue.startDate?.slice(0, 10) ?? '',
    dueDate: issue.dueDate?.slice(0, 10) ?? '',
    storyPoints: issue.storyPoints?.toString() ?? '',
    estimatedHours: issue.estimatedHours?.toString() ?? '',
    remainingHours: issue.remainingHours?.toString() ?? '',
    completedHours: issue.completedHours?.toString() ?? '',
    customFields: { ...(issue.customFields ?? {}) },
  }
}

function getMentionContext(value: string, selectionStart: number) {
  const beforeCursor = value.slice(0, selectionStart)
  const match = beforeCursor.match(/(^|\s)@([A-Za-z0-9._-]*)$/)
  if (!match) return null

  return {
    query: match[2] ?? '',
    replaceStart: selectionStart - (match[2]?.length ?? 0) - 1,
    replaceEnd: selectionStart,
  }
}

function renderCommentContent(comment: Comment) {
  const mentionRegex = /@\[(.+?)\]\(user:([a-z0-9]+)\)/gi
  const mentionsByToken = new Map(comment.mentions?.map((mention) => [mention.token, mention]) ?? [])
  const nodes: Array<{ key: string; value: string; mention: boolean }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(comment.content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({
        key: `text-${lastIndex}`,
        value: comment.content.slice(lastIndex, match.index),
        mention: false,
      })
    }

    const token = match[0]
    const mention = mentionsByToken.get(token)
    nodes.push({
      key: `mention-${match.index}`,
      value: `@${mention?.user.name ?? match[1]}`,
      mention: true,
    })
    lastIndex = match.index + token.length
  }

  if (lastIndex < comment.content.length) {
    nodes.push({
      key: `tail-${lastIndex}`,
      value: comment.content.slice(lastIndex),
      mention: false,
    })
  }

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
      {nodes.map((node) =>
        node.mention ? (
          <span key={node.key} className="font-semibold text-mention bg-mention-bg rounded px-1">
            {node.value}
          </span>
        ) : (
          <span key={node.key}>{node.value}</span>
        )
      )}
    </p>
  )
}

function getRelativeTime(value: string | Date | null | undefined) {
  if (!value) return '-'
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true })
}

export function WorkItemDetailContent(props: WorkItemDetailContentProps) {
  const router = useRouter()
  const openWorkItem = useAppStore((s) => s.openWorkItem)
  const closeWorkItem = useAppStore((s) => s.closeWorkItem)
  const { payload, isRefreshing, onReload, onIssueUpdated } = props
  const { issue, context, access, viewer } = payload

  const [draft, setDraft] = useState<WorkItemDraft>(() => createDraft(issue))
  const [selectedIterationTeamId, setSelectedIterationTeamId] = useState<string>(
    issue.iteration?.teamId ?? UNASSIGNED_VALUE
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<{ message: string; conflict: boolean } | null>(null)
  const [isCopying, setIsCopying] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const secondaryDelete = useDestructiveConfirm<
    | { kind: 'attachment'; id: string; label: string }
    | { kind: 'comment'; id: string; label: string }
    | { kind: 'relation'; id: string; label: string }
  >()
  const [operationError, setOperationError] = useState<string | null>(null)
  const [approvalRequestPrefill, setApprovalRequestPrefill] = useState<ApprovalRequestPrefill | null>(null)

  const [rightTab, setRightTab] = useState<'general' | 'history' | 'attachments' | 'git' | 'approvals'>('general')

  const [relations, setRelations] = useState<FlatRelation[] | null>(null)
  const [relationsCursor, setRelationsCursor] = useState<string | null>(null)
  const [loadingRelations, setLoadingRelations] = useState(false)
  const [relationsError, setRelationsError] = useState<string | null>(null)

  const [comments, setComments] = useState<Comment[] | null>(null)
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null)
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)

  const [history, setHistory] = useState<Activity[] | null>(null)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const [newComment, setNewComment] = useState('')
  const [newCommentSelectionStart, setNewCommentSelectionStart] = useState(0)
  const newCommentRef = useRef<HTMLTextAreaElement | null>(null)

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentContent, setEditingCommentContent] = useState('')
  const [editingCommentSelectionStart, setEditingCommentSelectionStart] = useState(0)
  const editingCommentRef = useRef<HTMLTextAreaElement | null>(null)

  const [linkSearch, setLinkSearch] = useState('')
  const deferredLinkSearch = useDeferredValue(linkSearch)
  const [linkCandidates, setLinkCandidates] = useState<Array<{ id: string; key: string; title: string }>>([])
  const [linkType, setLinkType] = useState<LinkType>('related')
  const [isSearchingLinks, setIsSearchingLinks] = useState(false)
  const [linkSearchError, setLinkSearchError] = useState<string | null>(null)

  type Attachment = {
    id: string
    fileName: string
    filePath: string
    fileSize: number
    mimeType: string
    uploadedAt: string
    user: { id: string; name: string; avatar: string | null }
  }
  const [attachments, setAttachments] = useState<Attachment[] | null>(null)
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDraft(createDraft(issue))
    setSelectedIterationTeamId(issue.iteration?.teamId ?? UNASSIGNED_VALUE)
    setApprovalRequestPrefill(null)
    setSaveError(null)
    setRelations(null)
    setRelationsCursor(null)
    setComments(null)
    setCommentsCursor(null)
    setHistory(null)
    setHistoryCursor(null)
    setNewComment('')
    setLinkSearch('')
    setLinkCandidates([])
    setAttachments(null)
    setOperationError(null)
    setRelationsError(null)
    setCommentsError(null)
    setHistoryError(null)
    setLinkSearchError(null)
    setAttachmentsError(null)
  }, [issue])

  const canUpdate = access.permissions.includes('workitem:update')
  const canCreate = access.permissions.includes('workitem:create')
  const canAssign = access.permissions.includes('workitem:assign')
  const canComment = access.permissions.includes('workitem:comment')
  const canLink = access.permissions.includes('workitem:link')
  const canDelete = access.permissions.includes('workitem:delete')

  const linkTypeOptions = useMemo(
    () => (canUpdate ? LINK_TYPES : RELATION_LINK_TYPES),
    [canUpdate]
  )

  useEffect(() => {
    if (!linkTypeOptions.some((option) => option.value === linkType)) {
      setLinkType('related')
    }
  }, [linkType, linkTypeOptions])

  const activeTypeDefinition = useMemo(
    () => getWorkItemTypeDefinition(context.workItemTypes, draft.workItemType),
    [context.workItemTypes, draft.workItemType]
  )

  const isPlanningSection = useCallback(
    (section: { key: string; title: string }) =>
      section.key.toLowerCase() === 'planning' || section.title.toLowerCase() === 'planning',
    []
  )

  const planningSections = useMemo(
    () => (activeTypeDefinition?.sections ?? []).filter((section) => isPlanningSection(section)),
    [activeTypeDefinition, isPlanningSection]
  )

  const nonPlanningSections = useMemo(
    () =>
      (activeTypeDefinition?.sections ?? []).filter((section) => !isPlanningSection(section)),
    [activeTypeDefinition, isPlanningSection]
  )

  const sortedTeams = useMemo(
    () => [...context.teams].sort((left, right) => left.name.localeCompare(right.name)),
    [context.teams]
  )

  const filteredIterations = useMemo(() => {
    if (selectedIterationTeamId === UNASSIGNED_VALUE) {
      return context.iterations.filter((iteration) => iteration.iterationType !== 'sprint')
    }

    return context.iterations.filter(
      (iteration) =>
        iteration.iterationType !== 'sprint' || iteration.teamId === selectedIterationTeamId
    )
  }, [context.iterations, selectedIterationTeamId])

  const formatIterationLabel = (iteration: Iteration) => {
    const baseLabel = iteration.path || iteration.name
    if (iteration.iterationType !== 'sprint') {
      return baseLabel
    }

    const teamName =
      iteration.team?.name ||
      context.teams.find((team) => team.id === iteration.teamId)?.name ||
      'No team'

    return `${baseLabel} (${teamName})`
  }

  useEffect(() => {
    if (draft.iterationId === UNASSIGNED_VALUE) {
      return
    }

    const selectedIteration = context.iterations.find(
      (iteration) => iteration.id === draft.iterationId
    )
    if (!selectedIteration) {
      setDraft((previous) => ({ ...previous, iterationId: UNASSIGNED_VALUE }))
      return
    }

    if (
      selectedIterationTeamId === UNASSIGNED_VALUE &&
      selectedIteration.iterationType === 'sprint'
    ) {
      setDraft((previous) => ({ ...previous, iterationId: UNASSIGNED_VALUE }))
      return
    }

    if (
      selectedIterationTeamId !== UNASSIGNED_VALUE &&
      selectedIteration.teamId !== selectedIterationTeamId
    ) {
      setDraft((previous) => ({ ...previous, iterationId: UNASSIGNED_VALUE }))
    }
  }, [context.iterations, draft.iterationId, selectedIterationTeamId])

  useEffect(() => {
    if (draft.iterationId === UNASSIGNED_VALUE) {
      return
    }

    const selectedIteration = context.iterations.find(
      (iteration) => iteration.id === draft.iterationId
    )
    if (!selectedIteration) {
      return
    }

    if (
      selectedIteration.teamId &&
      selectedIterationTeamId === UNASSIGNED_VALUE
    ) {
      setSelectedIterationTeamId(selectedIteration.teamId)
    }
  }, [context.iterations, draft.iterationId, selectedIterationTeamId])

  const patchPayload = useMemo(() => buildWorkItemPatchPayload(issue, draft), [issue, draft])
  const hasChanges = patchPayload !== null

  const linkedIssueIds = useMemo(
    () => new Set((relations ?? []).map((relation) => relation.linkedIssue.id)),
    [relations]
  )

  const commentMentionContext = getMentionContext(newComment, newCommentSelectionStart)
  const editingMentionContext =
    editingCommentId !== null
      ? getMentionContext(editingCommentContent, editingCommentSelectionStart)
      : null
  const mentionQuery = commentMentionContext?.query ?? editingMentionContext?.query ?? ''
  const mentionCandidates =
    commentMentionContext || editingMentionContext
      ? context.users
        .filter((user) =>
          mentionQuery ? user.name.toLowerCase().includes(mentionQuery.toLowerCase()) : true
        )
        .slice(0, 5)
      : []

  const canModerateComments = ['Admin', 'PM'].includes(access.role ?? '')
  const availableApprovalTransitions = useMemo(() => {
    const activeTypeId = activeTypeDefinition?.id
    const currentStateId = issue.stateRecord?.id ?? null

    if (!activeTypeId || !currentStateId) {
      return []
    }

    return (context.stateTransitions ?? [])
      .filter(
        (transition) =>
          transition.workItemTypeId === activeTypeId &&
          transition.fromStateId === currentStateId &&
          transition.isEnabled
      )
      .map((transition) => {
        const targetState = context.states.find((state) => state.id === transition.toStateId)
        return {
          ...transition,
          label: targetState ? `${issue.stateRecord?.name ?? 'Current'} -> ${targetState.name}` : transition.toStateId,
        }
      })
      .sort((left, right) => left.order - right.order)
  }, [activeTypeDefinition?.id, context.stateTransitions, context.states, issue.stateRecord?.id, issue.stateRecord?.name])

  const availableStates = useMemo(
    () =>
      getAvailableWorkItemStates({
        states: context.states,
        typeStateMappings: context.typeStateMappings ?? [],
        stateTransitions: context.stateTransitions ?? [],
        workItemTypeId: activeTypeDefinition?.id,
        currentStateId: issue.stateRecord?.id,
      }),
    [
      activeTypeDefinition?.id,
      context.stateTransitions,
      context.states,
      context.typeStateMappings,
      issue.stateRecord?.id,
    ]
  )

  const nextApprovalRequestToken = useMemo(
    () => (approvalRequestPrefill?.token ?? 0) + 1,
    [approvalRequestPrefill?.token]
  )

  const loadRelations = async (cursor?: string | null) => {
    setLoadingRelations(true)
    setRelationsError(null)
    try {
      const response = await fetch(
        `/api/relations?issueId=${issue.id}&flat=true&paginate=true&take=30${cursor ? `&cursor=${cursor}` : ''
        }`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch relations')
      }

      const data = (await response.json()) as PaginatedResponse<FlatRelation>
      setRelations((previous) => (cursor && previous ? [...previous, ...data.items] : data.items))
      setRelationsCursor(data.nextCursor)
      setRelationsError(null)
    } catch (error) {
      console.error(error)
      setRelationsError(error instanceof Error ? error.message : 'Failed to load linked work items')
    } finally {
      setLoadingRelations(false)
    }
  }

  const loadComments = async (cursor?: string | null) => {
    setLoadingComments(true)
    setCommentsError(null)
    try {
      const response = await fetch(
        `/api/comments?issueId=${issue.id}&paginate=true&take=30&includeRevisions=true${cursor ? `&cursor=${cursor}` : ''
        }`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch comments')
      }

      const data = (await response.json()) as PaginatedResponse<Comment>
      setComments((previous) => (cursor && previous ? [...previous, ...data.items] : data.items))
      setCommentsCursor(data.nextCursor)
      setCommentsError(null)
    } catch (error) {
      console.error(error)
      setCommentsError(error instanceof Error ? error.message : 'Failed to load comments')
    } finally {
      setLoadingComments(false)
    }
  }

  const loadHistory = async (cursor?: string | null) => {
    setLoadingHistory(true)
    setHistoryError(null)
    try {
      const response = await fetch(
        `/api/issues/${issue.id}/history?take=30${cursor ? `&cursor=${cursor}` : ''}`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch history')
      }

      const data = (await response.json()) as PaginatedResponse<Activity>
      setHistory((previous) => (cursor && previous ? [...previous, ...data.items] : data.items))
      setHistoryCursor(data.nextCursor)
      setHistoryError(null)
    } catch (error) {
      console.error(error)
      setHistoryError(error instanceof Error ? error.message : 'Failed to load history')
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (rightTab === 'general' && relations === null) void loadRelations(null)
    if (rightTab === 'history' && history === null) void loadHistory(null)
    if (rightTab === 'attachments' && attachments === null) void loadAttachments()
  }, [rightTab])

  useEffect(() => {
    if (comments === null) void loadComments(null)
  }, [issue.id, comments])

  useEffect(() => {
    const query = deferredLinkSearch.trim()
    if (!canLink || query.length < 2) {
      setLinkCandidates([])
      setLinkSearchError(null)
      return
    }

    let cancelled = false
    setIsSearchingLinks(true)
    setLinkSearchError(null)

    void fetch(
      `/api/issues?projectId=${issue.project.id}&minimal=true&includeTotal=false&pageSize=20&search=${encodeURIComponent(
        query
      )}&excludeIssueId=${issue.id}`
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, 'Failed to search work items'))
        }
        return response.json() as Promise<Array<{ id: string; key: string; title: string }>>
      })
      .then((items) => {
        if (cancelled) return
        startTransition(() => {
          setLinkCandidates(items.filter((item) => !linkedIssueIds.has(item.id)))
        })
      })
      .catch((error) => {
        if (!cancelled) {
          setLinkSearchError(error instanceof Error ? error.message : 'Failed to search work items')
        }
      })
      .finally(() => {
        if (!cancelled) setIsSearchingLinks(false)
      })

    return () => {
      cancelled = true
    }
  }, [canLink, deferredLinkSearch, issue.id, issue.project.id, linkedIssueIds])

  const insertMention = (userId: string, userName: string, mode: 'new' | 'edit') => {
    const textarea = mode === 'new' ? newCommentRef.current : editingCommentRef.current
    const value = mode === 'new' ? newComment : editingCommentContent
    const context = mode === 'new' ? commentMentionContext : editingMentionContext
    if (!textarea || !context) return

    const token = `@[${userName}](user:${userId}) `
    const nextValue = value.slice(0, context.replaceStart) + token + value.slice(context.replaceEnd)

    if (mode === 'new') {
      setNewComment(nextValue)
      setNewCommentSelectionStart(context.replaceStart + token.length)
    } else {
      setEditingCommentContent(nextValue)
      setEditingCommentSelectionStart(context.replaceStart + token.length)
    }

    requestAnimationFrame(() => {
      const nextCursor = context.replaceStart + token.length
      textarea.focus()
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const handleSave = async () => {
    if (!patchPayload || !canUpdate || isDeleting) return

    setSaveError(null)

    if (draft.startDate && draft.dueDate && new Date(draft.dueDate).getTime() < new Date(draft.startDate).getTime()) {
      setSaveError({ message: 'Due date cannot be earlier than start date.', conflict: false })
      return
    }

    const planningValidationError =
      validatePlanningNumber(draft.storyPoints, 'Story points', MAX_STORY_POINTS, true) ??
      validatePlanningNumber(draft.estimatedHours, 'Estimated hours', MAX_HOURS) ??
      validatePlanningNumber(draft.remainingHours, 'Remaining hours', MAX_HOURS) ??
      validatePlanningNumber(draft.completedHours, 'Completed hours', MAX_HOURS)

    if (planningValidationError) {
      setSaveError({ message: planningValidationError, conflict: false })
      return
    }

    setIsSaving(true)
    try {
      const requestPayload: Record<string, unknown> = {
        ...patchPayload,
        version: issue.version,
      }

      if (
        patchPayload.iterationId !== undefined &&
        patchPayload.iterationId !== null &&
        selectedIterationTeamId !== UNASSIGNED_VALUE
      ) {
        requestPayload.iterationTeamId = selectedIterationTeamId
      }

      const response = await fetch(`/api/issues/${issue.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        if (
          error?.details?.code === 'approval_required' ||
          error?.details?.code === 'approval_pending' ||
          error?.details?.code === 'approval_rejected'
        ) {
          setRightTab('approvals')

          if (
            error?.details?.code === 'approval_required' ||
            error?.details?.code === 'approval_rejected'
          ) {
            const matchingTransition = availableApprovalTransitions.find(
              (transition) =>
                transition.id === error?.details?.transitionId ||
                transition.toStateId === error?.details?.toStateId ||
                transition.toStateId === draft.stateId
            )

            const requestReason = matchingTransition
              ? error?.details?.code === 'approval_rejected'
                ? `Requesting a new approval for ${matchingTransition.label} after the previous request was rejected.`
                : `Requesting approval for ${matchingTransition.label}.`
              : error?.details?.code === 'approval_rejected'
                ? 'Requesting a new approval after the previous transition approval was rejected.'
                : 'Requesting approval for this workflow transition.'

            setApprovalRequestPrefill({
              token: nextApprovalRequestToken,
              transitionId: matchingTransition?.id ?? error?.details?.transitionId ?? null,
              requiredApprovals:
                error?.details?.minApprovals ?? matchingTransition?.minApprovals ?? null,
              reason: requestReason,
            })
          }
        }
        setSaveError({
          message: error.error || 'Failed to save work item. Review your changes and try again.',
          conflict: response.status === 409,
        })
        return
      }

      const updated = (await response.json()) as Issue
      setSaveError(null)
      onIssueUpdated(updated)
      toast.success('Work item saved')
    } catch (error) {
      console.error(error)
      setSaveError({
        message: 'Failed to save work item. Check your connection and try again.',
        conflict: false,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (): Promise<string | boolean> => {
    if (!canDelete || isDeleting) return false
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/issues/${issue.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return error.error || 'Failed to delete work item'
      }

      closeWorkItem()
      toast.success('Work item deleted')
      props.onDeleted?.()
      return true
    } catch (error) {
      console.error(error)
      return 'Failed to delete work item. Check your connection and try again.'
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCreateCopy = async () => {
    if (!canCreate || isCopying) return

    setOperationError(null)
    setIsCopying(true)
    try {
      const response = await fetch(`/api/issues/${issue.id}/copy`, { method: 'POST' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        setOperationError(error.error || 'Failed to create work item copy')
        return
      }

      const payload = (await response.json()) as {
        issue?: Issue
        warnings?: string[]
      }

      if (!payload.issue) {
        setOperationError('The copy was created, but its response was incomplete. Reload the work item list before trying again.')
        return
      }

      if (payload.warnings?.length) {
        toast.warning(`Work item copy created. ${payload.warnings[0]}`)
      } else {
        toast.success('Work item copy created')
      }

      openWorkItem(payload.issue.id)
      router.push(workItemPath(payload.issue.id))
    } catch (error) {
      console.error(error)
      setOperationError('Failed to create work item copy. Check your connection and try again.')
    } finally {
      setIsCopying(false)
    }
  }

  const loadAttachments = async () => {
    setLoadingAttachments(true)
    setAttachmentsError(null)
    try {
      const response = await fetch(`/api/attachments?issueId=${issue.id}`)
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to load attachments'))
      }
      const data = (await response.json()) as Attachment[]
      setAttachments(data)
      setAttachmentsError(null)
    } catch (error) {
      console.error(error)
      setAttachmentsError(error instanceof Error ? error.message : 'Failed to load attachments')
    } finally {
      setLoadingAttachments(false)
    }
  }

  const handleUploadAttachment = async (file: File) => {
    if (!canUpdate) return
    setAttachmentsError(null)
    setUploadingAttachment(true)
    try {
      const formData = new FormData()
      formData.append('issueId', issue.id)
      formData.append('file', file)
      const response = await fetch('/api/attachments', { method: 'POST', body: formData })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        setAttachmentsError(error.error || 'Failed to upload attachment')
        return
      }
      const attachment = (await response.json()) as Attachment
      setAttachments((prev) => (prev ? [attachment, ...prev] : [attachment]))
      toast.success('Attachment uploaded')
    } catch (error) {
      console.error(error)
      setAttachmentsError('Failed to upload attachment. Check your connection and try again.')
    } finally {
      setUploadingAttachment(false)
    }
  }

  const handleDeleteAttachment = async (attachmentId: string): Promise<string | void> => {
    try {
      const response = await fetch(`/api/attachments?id=${attachmentId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return error.error || 'Failed to delete attachment'
      }
      setAttachments((prev) => prev?.filter((a) => a.id !== attachmentId) ?? [])
      toast.success('Attachment deleted')
    } catch (error) {
      console.error(error)
      return 'Failed to delete attachment. Check your connection and try again.'
    }
  }

  const handleAddLink = async (targetIssueId: string) => {
    setRelationsError(null)
    try {
      if (linkType === 'parent' || linkType === 'child') {
        const issueIdToUpdate = linkType === 'parent' ? issue.id : targetIssueId
        const parentIssueId = linkType === 'parent' ? targetIssueId : issue.id

        const response = await fetch(`/api/issues/${issueIdToUpdate}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentIssueId }),
        })

        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          setRelationsError(error.error || 'Failed to update hierarchy link')
          return
        }

        if (linkType === 'parent') {
          const updated = (await response.json()) as Issue
          onIssueUpdated(updated)
        }

        setLinkSearch('')
        setLinkCandidates((previous) =>
          previous.filter((candidate) => candidate.id !== targetIssueId)
        )
        onReload()
        toast.success(
          linkType === 'parent' ? 'Parent work item linked' : 'Child work item linked'
        )
        return
      }

      const response = await fetch('/api/relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIssueId: issue.id,
          targetIssueId,
          relationType: linkType,
        }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        setRelationsError(error.error || 'Failed to add link')
        return
      }
      setLinkSearch('')
      await loadRelations(null)
      toast.success('Linked work item added')
    } catch (error) {
      console.error(error)
      setRelationsError('Failed to add link. Check your connection and try again.')
    }
  }

  const handleRemoveLink = async (relationId: string): Promise<string | void> => {
    try {
      const response = await fetch(`/api/relations?id=${relationId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return error.error || 'Failed to remove link'
      }
      setRelations((previous) => previous?.filter((relation) => relation.id !== relationId) ?? [])
    } catch (error) {
      console.error(error)
      return 'Failed to remove link. Check your connection and try again.'
    }
  }

  const handleAddComment = async () => {
    if (!canComment || !newComment.trim()) return
    setCommentsError(null)
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue.id, content: newComment.trim() }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        setCommentsError(error.error || 'Failed to add comment')
        return
      }

      const comment = (await response.json()) as Comment
      setComments((previous) => (previous ? [comment, ...previous] : [comment]))
      setNewComment('')
      setNewCommentSelectionStart(0)
    } catch (error) {
      console.error(error)
      setCommentsError('Failed to add comment. Your text is still here so you can try again.')
    }
  }

  const handleUpdateComment = async (commentId: string) => {
    if (!editingCommentContent.trim()) return
    setCommentsError(null)
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingCommentContent.trim() }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        setCommentsError(error.error || 'Failed to update comment')
        return
      }
      const updated = (await response.json()) as Comment
      setComments((previous) =>
        previous?.map((comment) => (comment.id === commentId ? updated : comment)) ?? []
      )
      setEditingCommentId(null)
      setEditingCommentContent('')
      setEditingCommentSelectionStart(0)
    } catch (error) {
      console.error(error)
      setCommentsError('Failed to update comment. Your edit is still here so you can try again.')
    }
  }

  const handleDeleteComment = async (commentId: string): Promise<string | void> => {
    try {
      const response = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return error.error || 'Failed to delete comment'
      }
      setComments((previous) => previous?.filter((comment) => comment.id !== commentId) ?? [])
    } catch (error) {
      console.error(error)
      return 'Failed to delete comment. Check your connection and try again.'
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(workItemUrl(issue.id))
      toast.success('Work item link copied')
    } catch (error) {
      console.error(error)
      toast.error('Failed to copy link')
    }
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-[linear-gradient(to_bottom,_hsl(var(--card)),_hsl(var(--background)))]',
        isDeleting && 'pointer-events-none opacity-70'
      )}
      data-testid="work-item-detail"
    >
      <header className="border-b border-border/70 bg-background/95 px-4 py-4 backdrop-blur md:px-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:overflow-x-auto">
            <Badge variant="default" className="h-8 shrink-0 rounded-lg px-3 text-xs font-medium">
              {activeTypeDefinition?.name ?? issue.workItemType}
            </Badge>
            <div className="min-w-[220px] flex-1 md:min-w-0">
              <Input
                value={draft.title}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, title: event.target.value }))
                }
                disabled={!canUpdate || isSaving || isDeleting}
                className="h-10 border-border/70 bg-background text-[15px] font-medium tracking-tight"
                placeholder="Work item title"
                data-testid="work-item-title-input"
              />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                className="h-9 px-4"
                disabled={!hasChanges || isSaving || isDeleting || !canUpdate || !draft.title.trim()}
                onClick={() => void handleSave()}
                data-testid="work-item-save-button"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    aria-label="More options"
                    data-testid="work-item-more-options-button"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={!canCreate || isCopying}
                    onClick={() => void handleCreateCopy()}
                    data-testid="work-item-create-copy-button"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {isCopying ? 'Creating copy...' : 'Create copy'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isDeleting}
                    onClick={() => void handleCopyLink()}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canDelete || isDeleting}
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteConfirmOpen(true)}
                    data-testid="work-item-delete-button"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? 'Deleting...' : 'Delete work item'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {saveError ? (
            <Alert variant="destructive" data-testid="work-item-save-error">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{saveError.conflict ? 'Newer changes are available' : 'Work item was not saved'}</AlertTitle>
              <AlertDescription>
                <p>{saveError.message}</p>
                {saveError.conflict ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isRefreshing}
                      onClick={() => onReload()}
                    >
                      {isRefreshing ? 'Reloading...' : 'Reload latest'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setSaveError(null)}>
                      Review my edits
                    </Button>
                  </div>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          {operationError ? (
            <InlineAlert
              tone="danger"
              title="Action not completed."
              action={<Button type="button" size="sm" variant="outline" onClick={() => setOperationError(null)}>Dismiss</Button>}
            >
              {operationError}
            </InlineAlert>
          ) : null}

          <div className="w-full overflow-hidden rounded-lg border border-border bg-card">
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x xl:grid-cols-5 xl:divide-y-0">

              {/* State */}
              <div className="group flex flex-col justify-start px-3 py-2.5 transition-colors hover:bg-surface-hover">
                <Label className="type-label mb-1.5 block">
                  State
                </Label>
                <Select value={draft.stateId} onValueChange={(value) => setDraft((previous) => ({ ...previous, stateId: value }))} disabled={!canUpdate || isSaving}>
                  <SelectTrigger className="h-8 w-full border-transparent bg-transparent px-2 -ml-2 shadow-none transition-colors hover:bg-muted/50 focus:ring-1 focus:ring-primary/30" data-testid="work-item-state-trigger">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    {!issue.stateRecord && <SelectItem value={UNASSIGNED_VALUE}>None</SelectItem>}
                    {availableStates.map((state) => (
                      <SelectItem key={state.id} value={state.id}>{state.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {issue.stateRecord && availableStates.length === 1 ? (
                  <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                    No workflow transition is available from this state.
                  </p>
                ) : null}
              </div>

              {/* Assigned To */}
              <div className="group flex flex-col justify-start px-3 py-2.5 transition-colors hover:bg-surface-hover">
                <Label className="type-label mb-1.5 block">
                  Assigned To
                </Label>
                <Select value={draft.assigneeId} onValueChange={(value) => setDraft((previous) => ({ ...previous, assigneeId: value }))} disabled={!canAssign || isSaving}>
                  <SelectTrigger className="h-8 w-full border-transparent bg-transparent px-2 -ml-2 shadow-none transition-colors hover:bg-muted/50 focus:ring-1 focus:ring-primary/30" data-testid="work-item-assignee-trigger">
                    <SelectValue placeholder="Assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                    {context.users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Area Path */}
              <div className="group flex flex-col justify-start px-3 py-2.5 transition-colors hover:bg-surface-hover">
                <Label className="type-label mb-1.5 block">
                  Area Path
                </Label>
                <Select value={draft.areaId} onValueChange={(value) => setDraft((previous) => ({ ...previous, areaId: value }))} disabled={!canUpdate || isSaving}>
                  <SelectTrigger className="h-8 w-full border-transparent bg-transparent px-2 -ml-2 shadow-none transition-colors hover:bg-muted/50 focus:ring-1 focus:ring-primary/30">
                    <SelectValue placeholder="Area" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_VALUE}>None</SelectItem>
                    {context.areas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>{area.path || area.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sprint Team */}
              <div className="group flex flex-col justify-start px-3 py-2.5 transition-colors hover:bg-surface-hover">
                <Label className="type-label mb-1.5 block">
                  Sprint Team
                </Label>
                <Select value={selectedIterationTeamId} onValueChange={setSelectedIterationTeamId} disabled={!canUpdate || isSaving}>
                  <SelectTrigger className="h-8 w-full border-transparent bg-transparent px-2 -ml-2 shadow-none transition-colors hover:bg-muted/50 focus:ring-1 focus:ring-primary/30">
                    <SelectValue placeholder="All teams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_VALUE}>All teams</SelectItem>
                    {sortedTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Iteration Path */}
              <div className="group flex flex-col justify-start px-3 py-2.5 transition-colors hover:bg-surface-hover">
                <Label className="type-label mb-1.5 block">
                  Iteration Path
                </Label>
                <Select value={draft.iterationId} onValueChange={(value) => setDraft((previous) => ({ ...previous, iterationId: value }))} disabled={!canUpdate || isSaving}>
                  <SelectTrigger className="h-8 w-full border-transparent bg-transparent px-2 -ml-2 shadow-none transition-colors hover:bg-muted/50 focus:ring-1 focus:ring-primary/30">
                    <SelectValue placeholder="Iteration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_VALUE}>None</SelectItem>
                    {filteredIterations.map((iteration) => (
                      <SelectItem key={iteration.id} value={iteration.id}>{formatIterationLabel(iteration)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedIterationTeamId === UNASSIGNED_VALUE ? (
                  <p className="mt-2 pl-1 text-[11px] leading-tight text-muted-foreground/80">
                    Select a sprint team to assign this work item to a sprint.
                  </p>
                ) : null}
              </div>

            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_320px] xl:grid-cols-[minmax(0,2fr)_360px] 2xl:grid-cols-[minmax(0,2fr)_420px]">
        <main className="min-h-0 space-y-3 overflow-y-auto bg-muted/10 p-3 md:p-4">
          <section className="space-y-3 rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm">
            <div className="space-y-1">
              <Label className="type-label">Description</Label>
            </div>
            <Textarea
              value={draft.description}
              onChange={(event) => setDraft((previous) => ({ ...previous, description: event.target.value }))}
              rows={6}
              className="resize-y border-border/70 bg-background"
              disabled={!canUpdate || isSaving}
              placeholder="Describe the work item"
              data-testid="work-item-description-input"
            />
          </section>

          {nonPlanningSections.length > 0 && (
            <section className="rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm">
              <DynamicWorkItemFields
                sections={nonPlanningSections}
                values={draft.customFields}
                users={context.users}
                iterations={context.iterations}
                areas={context.areas}
                teams={context.teams}
                onChange={(key, value) =>
                  setDraft((previous) => ({
                    ...previous,
                    customFields: { ...previous.customFields, [key]: value },
                  }))
                }
              />
            </section>
          )}
          <section className="space-y-3 rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="type-label">Discussion</Label>
                <p className="mt-1 text-xs text-muted-foreground">Comments, mentions, and delivery clarifications stay attached to this work item.</p>
              </div>
              {loadingComments && comments === null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            </div>
            {commentsError ? (
              <InlineAlert
                tone="danger"
                title="Discussion could not be updated."
                action={comments === null ? <Button size="sm" variant="outline" onClick={() => void loadComments(null)}>Retry</Button> : undefined}
              >
                {commentsError}
              </InlineAlert>
            ) : null}
            {comments && comments.length > 0 ? (
              <div className="space-y-3">
                {comments.map((comment) => {
                  const isEditing = editingCommentId === comment.id
                  const canManageComment = viewer?.id === comment.author.id || canModerateComments
                  return (
                    <div key={comment.id} className="rounded-xl border border-border/70 bg-background p-3.5">
                      <div className="mb-2 flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={comment.author.avatar || undefined} />
                          <AvatarFallback className="text-[10px]">{comment.author.name.split(' ').map((value) => value[0]).join('').toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{comment.author.name}</div>
                          <div className="text-[11px] text-muted-foreground">{getRelativeTime(comment.createdAt)}</div>
                        </div>
                        {canManageComment ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Comment actions"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditingCommentId(comment.id); setEditingCommentContent(comment.content); setEditingCommentSelectionStart(comment.content.length) }}>Edit</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => secondaryDelete.request({ kind: 'comment', id: comment.id, label: `comment by ${comment.author.name}` })}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                      {isEditing ? (
                        <div className="space-y-2">
                          <Textarea ref={editingCommentRef} rows={3} className="border-border/70 bg-background" value={editingCommentContent} onChange={(event) => { setEditingCommentContent(event.target.value); setEditingCommentSelectionStart(event.currentTarget.selectionStart ?? event.target.value.length) }} onSelect={(event) => setEditingCommentSelectionStart(event.currentTarget.selectionStart ?? editingCommentContent.length)} />
                          {editingMentionContext && mentionCandidates.length > 0 ? (
                            <div className="rounded-lg border border-border/70 bg-card">
                              {mentionCandidates.map((candidate) => <button key={candidate.id} type="button" className="w-full text-left px-2 py-1.5 hover:bg-accent text-xs text-mention focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => insertMention(candidate.id, candidate.name, 'edit')}>{candidate.name}</button>)}
                            </div>
                          ) : null}
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => void handleUpdateComment(comment.id)}>Save</Button>
                            <Button variant="ghost" size="sm" onClick={() => { setEditingCommentId(null); setEditingCommentContent('') }}>Cancel</Button>
                          </div>
                        </div>
                      ) : renderCommentContent(comment)}
                    </div>
                  )
                })}
              </div>
            ) : loadingComments ? (
              <div className="text-sm text-muted-foreground">Loading comments...</div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/80 bg-background/70 p-6 text-sm text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                No comments yet.
              </div>
            )}
            {commentsCursor ? (
              <Button variant="outline" size="sm" className="h-9 w-full" disabled={loadingComments} onClick={() => void loadComments(commentsCursor)}>
                Load more comments
              </Button>
            ) : null}
            <section className="space-y-2 rounded-xl border border-border/70 bg-background p-3">
              <Textarea ref={newCommentRef} value={newComment} rows={3} className="border-border/70 bg-background" disabled={!canComment} onChange={(event) => { setNewComment(event.target.value); setNewCommentSelectionStart(event.currentTarget.selectionStart ?? event.target.value.length) }} onSelect={(event) => setNewCommentSelectionStart(event.currentTarget.selectionStart ?? newComment.length)} placeholder={canComment ? 'Write a comment. Use @ to mention teammates.' : 'No comment permission'} />
              {commentMentionContext && mentionCandidates.length > 0 ? (
                <div className="rounded-lg border border-border/70 bg-card">
                  {mentionCandidates.map((candidate) => <button key={candidate.id} type="button" className="w-full text-left px-2 py-1.5 hover:bg-accent text-xs text-mention focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => insertMention(candidate.id, candidate.name, 'new')}>{candidate.name}</button>)}
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button size="sm" className="h-9 gap-1.5 px-4" onClick={() => void handleAddComment()} disabled={!canComment || !newComment.trim()}>
                  <Send className="h-3.5 w-3.5" />
                  Add comment
                </Button>
              </div>
            </section>
          </section>
        </main>
        <aside className="min-h-0 overflow-y-auto border-t border-border/70 bg-muted/10 lg:border-l lg:border-t-0">
          <Tabs value={rightTab} onValueChange={(value) => setRightTab(value as typeof rightTab)} className="flex h-full flex-col">
            <div className="border-b border-border/60 px-3 pt-3 md:px-4 md:pt-4">
              <TabsList className="grid h-auto w-full grid-cols-5 rounded-xl bg-muted/25 p-1">
                <TabsTrigger value="general" className="h-8 rounded-lg text-xs font-medium">General</TabsTrigger>
                <TabsTrigger value="attachments" className="h-8 rounded-lg text-xs font-medium">Files</TabsTrigger>
                <TabsTrigger value="history" className="h-8 rounded-lg text-xs font-medium">History</TabsTrigger>
                <TabsTrigger value="git" className="h-8 rounded-lg text-xs font-medium">Git</TabsTrigger>
                <TabsTrigger value="approvals" className="h-8 rounded-lg text-xs font-medium">Approvals</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="general" className="m-0 space-y-3 overflow-y-auto p-3 md:p-4">
              {planningSections.length > 0 ? (
                <section className="space-y-3 rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                  <DynamicWorkItemFields
                    sections={planningSections}
                    values={draft.customFields}
                    users={context.users}
                    iterations={context.iterations}
                    areas={context.areas}
                    teams={context.teams}
                    onChange={(key, value) =>
                      setDraft((previous) => ({
                        ...previous,
                        customFields: { ...previous.customFields, [key]: value },
                      }))
                    }
                  />
                </section>
              ) : null}

              <section className="space-y-3 rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                <div>
                  <div className="type-label">System</div>
                  <div className="mt-1 text-xs text-muted-foreground">Track sizing, effort, and execution details tied to this work item.</div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Priority</span>
                    <Select value={draft.priority} onValueChange={(value) => setDraft((previous) => ({ ...previous, priority: value as Issue['priority'] }))} disabled={!canUpdate || isSaving}>
                      <SelectTrigger className="h-8 w-28 border-border/70 bg-background text-xs" data-testid="work-item-priority-trigger"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lowest">Lowest</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="highest">Highest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Start Date</span>
                    <Input
                      type="date"
                      className="h-8 w-36 border-border/70 bg-background text-xs"
                      value={draft.startDate}
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, startDate: event.target.value }))
                      }
                      disabled={!canUpdate || isSaving}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Due Date</span>
                    <Input
                      type="date"
                      className="h-8 w-36 border-border/70 bg-background text-xs"
                      value={draft.dueDate}
                      min={draft.startDate || undefined}
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, dueDate: event.target.value }))
                      }
                      disabled={!canUpdate || isSaving}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Story Points</span>
                    <Input className="h-8 w-28 border-border/70 bg-background text-right text-xs" type="number" min={0} max={MAX_STORY_POINTS} value={draft.storyPoints} onChange={(event) => { const v = sanitizeIntegerInput(event.target.value); setDraft((previous) => ({ ...previous, storyPoints: v })) }} disabled={!canUpdate || isSaving} inputMode="numeric" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Estimated Hours</span>
                    <Input className="h-8 w-28 border-border/70 bg-background text-right text-xs" type="number" min={0} max={MAX_HOURS} step="0.1" value={draft.estimatedHours} onChange={(event) => { const v = sanitizeDecimalInput(event.target.value); setDraft((previous) => ({ ...previous, estimatedHours: v })) }} disabled={!canUpdate || isSaving} inputMode="decimal" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Remaining Hours</span>
                    <Input className="h-8 w-28 border-border/70 bg-background text-right text-xs" type="number" min={0} max={MAX_HOURS} step="0.1" value={draft.remainingHours} onChange={(event) => { const v = sanitizeDecimalInput(event.target.value); setDraft((previous) => ({ ...previous, remainingHours: v })) }} disabled={!canUpdate || isSaving} inputMode="decimal" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Completed Hours</span>
                    <Input className="h-8 w-28 border-border/70 bg-background text-right text-xs" type="number" min={0} max={MAX_HOURS} step="0.1" value={draft.completedHours} onChange={(event) => { const v = sanitizeDecimalInput(event.target.value); setDraft((previous) => ({ ...previous, completedHours: v })) }} disabled={!canUpdate || isSaving} inputMode="decimal" />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                <div>
                  <div className="type-label">Linked work items</div>
                  <div className="mt-1 text-xs text-muted-foreground">Track hierarchy, blockers, duplicates, and related delivery work.</div>
                </div>
                {relationsError ? (
                  <InlineAlert
                    tone="danger"
                    title="Links could not be updated."
                    action={relations === null ? <Button size="sm" variant="outline" onClick={() => void loadRelations(null)}>Retry</Button> : undefined}
                  >
                    {relationsError}
                  </InlineAlert>
                ) : null}
                {canLink ? (
                  <div className="space-y-2 rounded-lg border border-border/70 bg-background p-2.5">
                    <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
                      <Select value={linkType} onValueChange={(value) => setLinkType(value as LinkType)}>
                        <SelectTrigger className="h-9" aria-label="Link type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {linkTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        value={linkSearch}
                        onChange={(event) => setLinkSearch(event.target.value)}
                        placeholder="Search by key or title"
                        aria-label="Search work items to link"
                      />
                    </div>
                    {isSearchingLinks ? <p className="text-xs text-muted-foreground">Searching...</p> : null}
                    {linkSearchError ? <InlineAlert tone="danger">{linkSearchError}</InlineAlert> : null}
                    {linkCandidates.length > 0 ? (
                      <div className="max-h-44 space-y-1 overflow-y-auto">
                        {linkCandidates.map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => void handleAddLink(candidate.id)}
                          >
                            <span className="font-mono font-semibold">{candidate.key}</span>
                            <span className="min-w-0 truncate text-muted-foreground">{candidate.title}</span>
                          </button>
                        ))}
                      </div>
                    ) : deferredLinkSearch.trim().length >= 2 && !isSearchingLinks && !linkSearchError ? (
                      <p className="text-xs text-muted-foreground">No available work items match that search.</p>
                    ) : null}
                  </div>
                ) : null}
                {loadingRelations && relations === null ? (
                  <p className="text-xs text-muted-foreground">Loading links...</p>
                ) : relations && relations.length > 0 ? (
                  <div className="space-y-1.5">
                    {relations.map((relation) => (
                      <div key={relation.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2">
                        <Badge variant="outline" className="shrink-0 text-[9px]">{relation.relationType.replace(/_/g, ' ')}</Badge>
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openWorkItem(relation.linkedIssue.id)}>
                          <span className="block truncate text-xs font-medium"><span className="font-mono">{relation.linkedIssue.key}</span> {relation.linkedIssue.title}</span>
                        </button>
                        {canLink ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            aria-label={`Remove link to ${relation.linkedIssue.key}`}
                            onClick={() => secondaryDelete.request({ kind: 'relation', id: relation.id, label: `link to ${relation.linkedIssue.key}` })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : relations ? (
                  <p className="text-xs text-muted-foreground">No linked work items.</p>
                ) : null}
                {relationsCursor ? (
                  <Button variant="outline" size="sm" className="w-full" disabled={loadingRelations} onClick={() => void loadRelations(relationsCursor)}>Load more links</Button>
                ) : null}
              </section>
            </TabsContent>

            <TabsContent value="attachments" className="m-0 space-y-3 overflow-y-auto p-3 md:p-4">
              {attachmentsError ? (
                <InlineAlert
                  tone="danger"
                  title="Files could not be updated."
                  action={attachments === null ? <Button size="sm" variant="outline" onClick={() => void loadAttachments()}>Retry</Button> : undefined}
                >
                  {attachmentsError}
                </InlineAlert>
              ) : null}
              {canUpdate && (
                <div className="space-y-2 rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleUploadAttachment(file)
                      e.target.value = ''
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-full gap-2 border-dashed"
                    disabled={uploadingAttachment}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploadingAttachment ? 'Uploading...' : 'Attach file (max 10MB)'}
                  </Button>
                </div>
              )}
              {loadingAttachments && attachments === null ? (
                <div className="text-sm text-muted-foreground">Loading attachments...</div>
              ) : attachments && attachments.length > 0 ? (
                <div className="space-y-2">
                  {attachments.map((att) => (
                    <div key={att.id} className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{att.fileName}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {(att.fileSize / 1024).toFixed(1)} KB &middot; {att.user.name} &middot; {getRelativeTime(att.uploadedAt)}
                          </div>
                        </div>
                        <a
                          // Routed rather than a direct file path: the endpoint
                          // authorises against the parent work item before
                          // returning anything.
                          href={`/api/attachments/${att.id}`}
                          download={att.fileName}
                          className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent transition-colors"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        {canUpdate && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete attachment" onClick={() => secondaryDelete.request({ kind: 'attachment', id: att.id, label: att.fileName })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/80 bg-card/50 p-6 text-sm text-muted-foreground">
                  <Paperclip className="h-4 w-4" />
                  No attachments yet.
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="m-0 space-y-3 overflow-y-auto p-3 md:p-4">
              {historyError ? (
                <InlineAlert tone="danger" title="History unavailable." action={<Button size="sm" variant="outline" onClick={() => void loadHistory(null)}>Retry</Button>}>
                  {historyError}
                </InlineAlert>
              ) : null}
              {loadingHistory && history === null ? (
                <div className="text-sm text-muted-foreground">Loading history...</div>
              ) : history && history.length > 0 ? (
                <div className="space-y-2">
                  {history.map((activity) => (
                    <div key={activity.id} className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                      <div className="flex items-center gap-2 text-sm">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={activity.user.avatar || undefined} />
                          <AvatarFallback className="text-[10px]">{activity.user.name.split(' ').map((value) => value[0]).join('').toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{activity.user.name}</span>
                        <span className="text-muted-foreground">{activity.action.replace(/_/g, ' ')}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{getRelativeTime(activity.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/80 bg-card/50 p-6 text-sm text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  No history entries yet.
                </div>
              )}
              {historyCursor ? (
                <Button variant="outline" size="sm" className="h-9 w-full" disabled={loadingHistory} onClick={() => void loadHistory(historyCursor)}>
                  Load more history
                </Button>
              ) : null}
            </TabsContent>

            <TabsContent value="git" className="m-0 overflow-y-auto p-3 md:p-4">
              <GitLinksPanel issueId={issue.id} projectId={issue.project.id} />
            </TabsContent>

            <TabsContent value="approvals" className="m-0 overflow-y-auto p-3 md:p-4">
              <ApprovalPanel
                issueId={issue.id}
                transitions={availableApprovalTransitions}
                requestPrefill={approvalRequestPrefill}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
      <ConfirmDestructiveDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${issue.key}?`}
        description={
          <>
            <span className="font-medium text-foreground">{issue.title}</span> and its comments,
            attachments, links, and history will be permanently removed.
          </>
        }
        confirmLabel="Delete work item"
        onConfirm={handleDelete}
      />
      <ConfirmDestructiveDialog
        open={secondaryDelete.isOpen}
        onOpenChange={secondaryDelete.onOpenChange}
        title={
          secondaryDelete.target?.kind === 'attachment'
            ? 'Delete attachment?'
            : secondaryDelete.target?.kind === 'comment'
              ? 'Delete comment?'
              : 'Remove work item link?'
        }
        description={
          secondaryDelete.target
            ? secondaryDelete.target.kind === 'attachment'
              ? `The file "${secondaryDelete.target.label}" will be permanently removed from this work item.`
              : secondaryDelete.target.kind === 'comment'
                ? `The ${secondaryDelete.target.label} and its revision history will be permanently removed.`
                : `The ${secondaryDelete.target.label} will be removed. Both work items will remain available.`
            : ''
        }
        confirmLabel={secondaryDelete.target?.kind === 'relation' ? 'Remove link' : 'Delete'}
        onConfirm={async () => {
          const target = secondaryDelete.target
          if (!target) return false
          if (target.kind === 'attachment') return handleDeleteAttachment(target.id)
          if (target.kind === 'comment') return handleDeleteComment(target.id)
          return handleRemoveLink(target.id)
        }}
      />
    </div>
  )
}
