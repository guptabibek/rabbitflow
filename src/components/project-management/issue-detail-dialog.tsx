'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { DynamicWorkItemFields } from '@/components/project-management/dynamic-work-item-fields'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import {
  UNASSIGNED_VALUE,
  buildWorkItemPatchPayload,
  canonicalWorkItemRoute,
  getWorkItemTypeDefinition,
  type WorkItemDraft,
} from '@/lib/domain/work-item-view'
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

type LinkType = 'related' | 'blocked_by' | 'blocks' | 'duplicate_of' | 'tests' | 'tested_by'

type FlatRelation = {
  id: string
  relationType: LinkType
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
}

const LINK_TYPES: Array<{ value: LinkType; label: string }> = [
  { value: 'related', label: 'Related' },
  { value: 'blocked_by', label: 'Blocked By' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'duplicate_of', label: 'Duplicate Of' },
  { value: 'tests', label: 'Tests' },
  { value: 'tested_by', label: 'Tested By' },
]

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
    storyPoints: issue.storyPoints?.toString() ?? '',
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
          <span key={node.key} className="font-medium text-primary">
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
  const { payload, isRefreshing, onReload, onIssueUpdated } = props
  const { issue, context, access, viewer } = payload

  const [draft, setDraft] = useState<WorkItemDraft>(() => createDraft(issue))
  const [isSaving, setIsSaving] = useState(false)

  const [rightTab, setRightTab] = useState<'related' | 'discussion' | 'history' | 'attachments'>('related')

  const [relations, setRelations] = useState<FlatRelation[] | null>(null)
  const [relationsCursor, setRelationsCursor] = useState<string | null>(null)
  const [loadingRelations, setLoadingRelations] = useState(false)

  const [comments, setComments] = useState<Comment[] | null>(null)
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null)
  const [loadingComments, setLoadingComments] = useState(false)

  const [history, setHistory] = useState<Activity[] | null>(null)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

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
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDraft(createDraft(issue))
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
  }, [issue])

  const canUpdate = access.permissions.includes('workitem:update')
  const canAssign = access.permissions.includes('workitem:assign')
  const canComment = access.permissions.includes('workitem:comment')
  const canLink = access.permissions.includes('workitem:link')
  const canDelete = access.permissions.includes('workitem:delete')

  const activeTypeDefinition = useMemo(
    () => getWorkItemTypeDefinition(context.workItemTypes, draft.workItemType),
    [context.workItemTypes, draft.workItemType]
  )

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

  const loadRelations = async (cursor?: string | null) => {
    setLoadingRelations(true)
    try {
      const response = await fetch(
        `/api/relations?issueId=${issue.id}&flat=true&paginate=true&take=30${
          cursor ? `&cursor=${cursor}` : ''
        }`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch relations')
      }

      const data = (await response.json()) as PaginatedResponse<FlatRelation>
      setRelations((previous) => (cursor && previous ? [...previous, ...data.items] : data.items))
      setRelationsCursor(data.nextCursor)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load linked work items')
    } finally {
      setLoadingRelations(false)
    }
  }

  const loadComments = async (cursor?: string | null) => {
    setLoadingComments(true)
    try {
      const response = await fetch(
        `/api/comments?issueId=${issue.id}&paginate=true&take=30&includeRevisions=true${
          cursor ? `&cursor=${cursor}` : ''
        }`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch comments')
      }

      const data = (await response.json()) as PaginatedResponse<Comment>
      setComments((previous) => (cursor && previous ? [...previous, ...data.items] : data.items))
      setCommentsCursor(data.nextCursor)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load comments')
    } finally {
      setLoadingComments(false)
    }
  }

  const loadHistory = async (cursor?: string | null) => {
    setLoadingHistory(true)
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
    } catch (error) {
      console.error(error)
      toast.error('Failed to load history')
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (rightTab === 'related' && relations === null) void loadRelations(null)
    if (rightTab === 'discussion' && comments === null) void loadComments(null)
    if (rightTab === 'history' && history === null) void loadHistory(null)
    if (rightTab === 'attachments' && attachments === null) void loadAttachments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab])

  useEffect(() => {
    const query = deferredLinkSearch.trim()
    if (!canLink || query.length < 2) {
      setLinkCandidates([])
      return
    }

    let cancelled = false
    setIsSearchingLinks(true)

    void fetch(
      `/api/issues?projectId=${issue.project.id}&minimal=true&includeTotal=false&pageSize=20&search=${encodeURIComponent(
        query
      )}&excludeIssueId=${issue.id}`
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('search failed')
        return response.json() as Promise<Array<{ id: string; key: string; title: string }>>
      })
      .then((items) => {
        if (cancelled) return
        startTransition(() => {
          setLinkCandidates(items.filter((item) => !linkedIssueIds.has(item.id)))
        })
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to search work items')
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
    if (!patchPayload || !canUpdate) return
    setIsSaving(true)
    try {
      const response = await fetch(`/api/issues/${issue.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patchPayload, version: issue.version }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to save work item')
        return
      }

      const updated = (await response.json()) as Issue
      onIssueUpdated(updated)
      toast.success('Work item saved')
    } catch (error) {
      console.error(error)
      toast.error('Failed to save work item')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!canDelete || !confirm('Delete this work item?')) return
    try {
      const response = await fetch(`/api/issues/${issue.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to delete work item')
        return
      }
      toast.success('Work item deleted')
      router.push('/')
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete work item')
    }
  }

  const loadAttachments = async () => {
    setLoadingAttachments(true)
    try {
      const response = await fetch(`/api/attachments?issueId=${issue.id}`)
      if (!response.ok) throw new Error('Failed to fetch attachments')
      const data = (await response.json()) as Attachment[]
      setAttachments(data)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load attachments')
    } finally {
      setLoadingAttachments(false)
    }
  }

  const handleUploadAttachment = async (file: File) => {
    if (!canUpdate) return
    setUploadingAttachment(true)
    try {
      const formData = new FormData()
      formData.append('issueId', issue.id)
      formData.append('file', file)
      const response = await fetch('/api/attachments', { method: 'POST', body: formData })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to upload attachment')
        return
      }
      const attachment = (await response.json()) as Attachment
      setAttachments((prev) => (prev ? [attachment, ...prev] : [attachment]))
      toast.success('Attachment uploaded')
    } catch (error) {
      console.error(error)
      toast.error('Failed to upload attachment')
    } finally {
      setUploadingAttachment(false)
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      const response = await fetch(`/api/attachments?id=${attachmentId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to delete attachment')
        return
      }
      setAttachments((prev) => prev?.filter((a) => a.id !== attachmentId) ?? [])
      toast.success('Attachment deleted')
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete attachment')
    }
  }

  const handleAddLink = async (targetIssueId: string) => {
    try {
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
        toast.error(error.error || 'Failed to add link')
        return
      }
      setLinkSearch('')
      await loadRelations(null)
      toast.success('Linked work item added')
    } catch (error) {
      console.error(error)
      toast.error('Failed to add link')
    }
  }

  const handleRemoveLink = async (relationId: string) => {
    try {
      const response = await fetch(`/api/relations?id=${relationId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to remove link')
        return
      }
      setRelations((previous) => previous?.filter((relation) => relation.id !== relationId) ?? [])
    } catch (error) {
      console.error(error)
      toast.error('Failed to remove link')
    }
  }

  const handleAddComment = async () => {
    if (!canComment || !newComment.trim()) return
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue.id, content: newComment.trim() }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to add comment')
        return
      }

      const comment = (await response.json()) as Comment
      setComments((previous) => (previous ? [comment, ...previous] : [comment]))
      setNewComment('')
      setNewCommentSelectionStart(0)
    } catch (error) {
      console.error(error)
      toast.error('Failed to add comment')
    }
  }

  const handleUpdateComment = async (commentId: string) => {
    if (!editingCommentContent.trim()) return
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingCommentContent.trim() }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to update comment')
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
      toast.error('Failed to update comment')
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const response = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to delete comment')
        return
      }
      setComments((previous) => previous?.filter((comment) => comment.id !== commentId) ?? [])
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete comment')
    }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-border bg-background px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">{issue.key}</Badge>
          <Select
            value={draft.workItemType}
            onValueChange={(value) => setDraft((previous) => ({ ...previous, workItemType: value }))}
            disabled={!canUpdate || isSaving}
          >
            <SelectTrigger className="w-[200px] h-8">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {context.workItemTypes.map((type) => (
                <SelectItem key={type.id} value={type.key}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={onReload} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Reload'}
            </Button>
            <Button size="sm" className="h-8" disabled={!hasChanges || isSaving || !canUpdate || !draft.title.trim()} onClick={() => void handleSave()}>
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(window.location.href)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canDelete} className="text-destructive focus:text-destructive" onClick={() => void handleDelete()}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete work item
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Input
          value={draft.title}
          onChange={(event) => setDraft((previous) => ({ ...previous, title: event.target.value }))}
          disabled={!canUpdate || isSaving}
          className="h-10 text-lg font-semibold"
          placeholder="Work item title"
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">State</Label>
            <Select value={draft.stateId} onValueChange={(value) => setDraft((previous) => ({ ...previous, stateId: value }))} disabled={!canUpdate || isSaving}>
              <SelectTrigger className="h-8"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>None</SelectItem>
                {context.states.map((state) => <SelectItem key={state.id} value={state.id}>{state.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Assigned To</Label>
            <Select value={draft.assigneeId} onValueChange={(value) => setDraft((previous) => ({ ...previous, assigneeId: value }))} disabled={!canAssign || isSaving}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Assignee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                {context.users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Area Path</Label>
            <Select value={draft.areaId} onValueChange={(value) => setDraft((previous) => ({ ...previous, areaId: value }))} disabled={!canUpdate || isSaving}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Area" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>None</SelectItem>
                {context.areas.map((area) => <SelectItem key={area.id} value={area.id}>{area.path || area.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Iteration Path</Label>
            <Select value={draft.iterationId} onValueChange={(value) => setDraft((previous) => ({ ...previous, iterationId: value }))} disabled={!canUpdate || isSaving}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Iteration" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>None</SelectItem>
                {context.iterations.map((iteration) => <SelectItem key={iteration.id} value={iteration.id}>{iteration.path || iteration.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_420px]">
        <main className="min-h-0 overflow-y-auto p-4 space-y-4">
          <section className="rounded-lg border border-border p-4 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Description</Label>
            <Textarea
              value={draft.description}
              onChange={(event) => setDraft((previous) => ({ ...previous, description: event.target.value }))}
              rows={6}
              className="resize-y"
              disabled={!canUpdate || isSaving}
              placeholder="Describe the work item"
            />
          </section>

          {activeTypeDefinition?.sections?.length ? (
            <section className="rounded-lg border border-border p-4">
              <DynamicWorkItemFields
                sections={activeTypeDefinition.sections}
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
          ) : (
            <section className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              This work item type has no configured schema sections.
            </section>
          )}
        </main>

        <aside className="min-h-0 border-t xl:border-t-0 xl:border-l border-border overflow-y-auto">
          <Tabs value={rightTab} onValueChange={(value) => setRightTab(value as typeof rightTab)} className="h-full flex flex-col">
            <div className="px-4 pt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="related">Related</TabsTrigger>
                <TabsTrigger value="attachments">Files</TabsTrigger>
                <TabsTrigger value="discussion">Discussion</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="related" className="m-0 p-4 space-y-4 overflow-y-auto">
              <section className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" />
                  Hierarchy
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Parent</div>
                    {issue.parentIssue ? (
                      <button
                        type="button"
                        className="text-left hover:text-primary"
                        onClick={() => router.push(canonicalWorkItemRoute(issue.parentIssue!.id))}
                      >
                        <span className="font-mono text-xs text-muted-foreground">{issue.parentIssue.key}</span>{' '}
                        <span>{issue.parentIssue.title}</span>
                      </button>
                    ) : (
                      <p className="text-muted-foreground">No parent work item</p>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Children</div>
                    {issue.subIssues && issue.subIssues.length > 0 ? (
                      <div className="space-y-1">
                        {issue.subIssues.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            className="w-full text-left rounded border border-border px-2 py-1.5 hover:bg-accent"
                            onClick={() => router.push(canonicalWorkItemRoute(child.id))}
                          >
                            <span className="font-mono text-xs text-muted-foreground">{child.key}</span>{' '}
                            <span className="text-sm">{child.title}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No child work items</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked Work</div>
                  {loadingRelations ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                </div>
                {relations && relations.length > 0 ? (
                  <div className="space-y-2">
                    {relations.map((relation) => (
                      <div key={relation.id} className="rounded border border-border px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {LINK_TYPES.find((item) => item.value === relation.relationType)?.label ?? relation.relationType}
                          </Badge>
                          <button type="button" className="min-w-0 flex-1 text-left hover:text-primary" onClick={() => router.push(canonicalWorkItemRoute(relation.linkedIssue.id))}>
                            <span className="font-mono text-xs text-muted-foreground">{relation.linkedIssue.key}</span>{' '}
                            <span className="truncate text-sm">{relation.linkedIssue.title}</span>
                          </button>
                          {canLink ? (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void handleRemoveLink(relation.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No linked work items</div>
                )}
                {relationsCursor ? (
                  <Button variant="outline" size="sm" className="w-full" disabled={loadingRelations} onClick={() => void loadRelations(relationsCursor)}>
                    Load more links
                  </Button>
                ) : null}
                {canLink ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    <div className="flex items-center gap-2">
                      <Select value={linkType} onValueChange={(value) => setLinkType(value as LinkType)}>
                        <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LINK_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className="h-8" value={linkSearch} onChange={(event) => setLinkSearch(event.target.value)} placeholder="Search work items" />
                    </div>
                    {isSearchingLinks ? (
                      <div className="text-xs text-muted-foreground">Searching...</div>
                    ) : linkCandidates.length > 0 ? (
                      <div className="space-y-1 max-h-48 overflow-y-auto rounded border border-border p-1">
                        {linkCandidates.map((candidate) => (
                          <button key={candidate.id} type="button" className="w-full text-left rounded px-2 py-1.5 hover:bg-accent" onClick={() => void handleAddLink(candidate.id)}>
                            <span className="font-mono text-xs text-muted-foreground">{candidate.key}</span>{' '}
                            <span className="text-sm">{candidate.title}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Type at least 2 characters to search.</div>
                    )}
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">System</div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Priority</span>
                    <Select value={draft.priority} onValueChange={(value) => setDraft((previous) => ({ ...previous, priority: value as Issue['priority'] }))} disabled={!canUpdate || isSaving}>
                      <SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lowest">Lowest</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="highest">Highest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Story Points</span>
                    <Input className="h-7 w-24 text-right" value={draft.storyPoints} onChange={(event) => { const v = event.target.value.replace(/[^0-9]/g, ''); setDraft((previous) => ({ ...previous, storyPoints: v })) }} disabled={!canUpdate || isSaving} inputMode="numeric" />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Created</span><span>{getRelativeTime(issue.createdAt)}</span></div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Updated</span><span>{getRelativeTime(issue.updatedAt)}</span></div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Version</span><span>{issue.version ?? '-'}</span></div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="attachments" className="m-0 p-4 space-y-3 overflow-y-auto">
              {canUpdate && (
                <div className="space-y-2">
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
                    className="w-full gap-2 border-dashed"
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
                    <div key={att.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{att.fileName}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {(att.fileSize / 1024).toFixed(1)} KB &middot; {att.user.name} &middot; {getRelativeTime(att.uploadedAt)}
                          </div>
                        </div>
                        <a
                          href={att.filePath}
                          download={att.fileName}
                          className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent transition-colors"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        {canUpdate && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void handleDeleteAttachment(att.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  No attachments yet.
                </div>
              )}
            </TabsContent>

            <TabsContent value="discussion" className="m-0 p-4 space-y-3 overflow-y-auto">
              {loadingComments && comments === null ? (
                <div className="text-sm text-muted-foreground">Loading comments...</div>
              ) : comments && comments.length > 0 ? (
                <div className="space-y-3">
                  {comments.map((comment) => {
                    const isEditing = editingCommentId === comment.id
                    const canManageComment = viewer?.id === comment.author.id || canModerateComments
                    return (
                      <div key={comment.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={comment.author.avatar || undefined} />
                            <AvatarFallback className="text-[10px]">{comment.author.name.split(' ').map((value) => value[0]).join('').toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{comment.author.name}</div>
                            <div className="text-[11px] text-muted-foreground">{getRelativeTime(comment.createdAt)}</div>
                          </div>
                          {canManageComment ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setEditingCommentId(comment.id); setEditingCommentContent(comment.content); setEditingCommentSelectionStart(comment.content.length) }}>Edit</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void handleDeleteComment(comment.id)}>Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                        {isEditing ? (
                          <div className="space-y-2">
                            <Textarea ref={editingCommentRef} rows={3} value={editingCommentContent} onChange={(event) => { setEditingCommentContent(event.target.value); setEditingCommentSelectionStart(event.currentTarget.selectionStart ?? event.target.value.length) }} onSelect={(event) => setEditingCommentSelectionStart(event.currentTarget.selectionStart ?? editingCommentContent.length)} />
                            {editingMentionContext && mentionCandidates.length > 0 ? (
                              <div className="rounded border border-border">
                                {mentionCandidates.map((candidate) => <button key={candidate.id} type="button" className="w-full text-left px-2 py-1.5 hover:bg-accent text-xs" onClick={() => insertMention(candidate.id, candidate.name, 'edit')}>{candidate.name}</button>)}
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
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  No comments yet.
                </div>
              )}
              {commentsCursor ? (
                <Button variant="outline" size="sm" className="w-full" disabled={loadingComments} onClick={() => void loadComments(commentsCursor)}>
                  Load more comments
                </Button>
              ) : null}
              <section className="rounded-lg border border-border p-3 space-y-2">
                <Textarea ref={newCommentRef} value={newComment} rows={3} disabled={!canComment} onChange={(event) => { setNewComment(event.target.value); setNewCommentSelectionStart(event.currentTarget.selectionStart ?? event.target.value.length) }} onSelect={(event) => setNewCommentSelectionStart(event.currentTarget.selectionStart ?? newComment.length)} placeholder={canComment ? 'Write a comment. Use @ to mention teammates.' : 'No comment permission'} />
                {commentMentionContext && mentionCandidates.length > 0 ? (
                  <div className="rounded border border-border">
                    {mentionCandidates.map((candidate) => <button key={candidate.id} type="button" className="w-full text-left px-2 py-1.5 hover:bg-accent text-xs" onClick={() => insertMention(candidate.id, candidate.name, 'new')}>{candidate.name}</button>)}
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <Button size="sm" className="gap-1.5" onClick={() => void handleAddComment()} disabled={!canComment || !newComment.trim()}>
                    <Send className="h-3.5 w-3.5" />
                    Add comment
                  </Button>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="history" className="m-0 p-4 space-y-3 overflow-y-auto">
              {loadingHistory && history === null ? (
                <div className="text-sm text-muted-foreground">Loading history...</div>
              ) : history && history.length > 0 ? (
                <div className="space-y-2">
                  {history.map((activity) => (
                    <div key={activity.id} className="rounded-lg border border-border p-3">
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
                <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  No history entries yet.
                </div>
              )}
              {historyCursor ? (
                <Button variant="outline" size="sm" className="w-full" disabled={loadingHistory} onClick={() => void loadHistory(historyCursor)}>
                  Load more history
                </Button>
              ) : null}
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {!canUpdate ? (
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          You have read-only access to this work item.
        </div>
      ) : (
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
          {hasChanges ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {hasChanges ? 'Unsaved changes' : 'All changes saved'}
          {isSaving || isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        </div>
      )}
    </div>
  )
}
