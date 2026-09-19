'use client'

import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAppStore } from '@/store/app-store'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { getApiErrorMessage } from '@/lib/utils'
import {
  BookOpen,
  Plus,
  FileText,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit,
  Clock,
  FolderOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import { InlineAlert } from '@/components/ui/states'

const MAX_DOCUMENT_TITLE_LENGTH = 500
const MAX_DOCUMENT_CONTENT_LENGTH = 500000

type DocNode = {
  id: string
  title: string
  parentId: string | null
  isPublished: boolean
  updatedAt: string
  lastEditedBy: { id: string; name: string } | null
  children: DocNode[]
}

type DocumentDetail = {
  id: string
  title: string
  content: string
  isPublished: boolean
  version: number
  projectId: string
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string } | null
  lastEditedBy: { id: string; name: string } | null
  revisions?: Array<{
    id: string
    title: string
    createdAt: string
  }>
}

export function DocumentsView() {
  const { currentProject } = useAppStore()
  const [tree, setTree] = useState<DocNode[]>([])
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [newDocParentId, setNewDocParentId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createTitleError, setCreateTitleError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [editFieldErrors, setEditFieldErrors] = useState<Partial<Record<'title' | 'content', string>>>({})
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const projectId = currentProject?.id

  useEffect(() => {
    setSelectedDoc(null)
    setEditMode(false)
  }, [projectId])

  const fetchTree = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    setTreeError(null)
    try {
      const res = await fetch(`/api/documents?projectId=${projectId}`)
      if (!res.ok) {
        setTreeError(await getApiErrorMessage(res, 'Failed to load documents'))
        setTree([])
        return
      }

      const data = await res.json()
      setTree(data)
    } catch {
      setTreeError('Failed to load documents')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchTree() }, [fetchTree])

  const selectDocument = async (id: string) => {
    setDocumentError(null)
    try {
      const res = await fetch(`/api/documents/${id}?revisions=true`)
      if (!res.ok) {
        setDocumentError(await getApiErrorMessage(res, 'Failed to load document'))
        return
      }

      const doc = await res.json()
      setSelectedDoc({
        ...doc,
        isPublished: Boolean(doc.isPublished),
        version: Array.isArray(doc.revisions) ? doc.revisions.length + 1 : 1,
      })
      setEditMode(false)
    } catch {
      setDocumentError('Failed to load document')
    }
  }

  const createDocument = async () => {
    if (!projectId) return
    if (!newDocTitle.trim()) {
      setCreateTitleError('Enter a document title.')
      return
    }

    if (newDocTitle.trim().length > MAX_DOCUMENT_TITLE_LENGTH) {
      setCreateTitleError(`Use ${MAX_DOCUMENT_TITLE_LENGTH} characters or fewer.`)
      return
    }

    setCreateTitleError(null)
    setCreateError(null)
    setIsSaving(true)
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: newDocTitle.trim(),
          parentId: newDocParentId,
        }),
      })

      if (!res.ok) {
        setCreateError(await getApiErrorMessage(res, 'Failed to create document'))
        return
      }

      const doc = await res.json()
      setNewDocTitle('')
      setNewDocParentId(null)
      setCreateOpen(false)
      await fetchTree()
      await selectDocument(doc.id)
      toast.success('Document created')
    } catch {
      setCreateError('Failed to create document')
    } finally {
      setIsSaving(false)
    }
  }

  const saveDocument = async () => {
    if (!selectedDoc) return
    if (!editTitle.trim()) {
      setEditFieldErrors((previous) => ({ ...previous, title: 'Enter a document title.' }))
      return
    }

    if (editTitle.trim().length > MAX_DOCUMENT_TITLE_LENGTH) {
      setEditFieldErrors((previous) => ({
        ...previous,
        title: `Use ${MAX_DOCUMENT_TITLE_LENGTH} characters or fewer.`,
      }))
      return
    }

    if (editContent.length > MAX_DOCUMENT_CONTENT_LENGTH) {
      setEditFieldErrors((previous) => ({
        ...previous,
        content: `Use ${MAX_DOCUMENT_CONTENT_LENGTH} characters or fewer.`,
      }))
      return
    }

    setEditFieldErrors({})
    setEditError(null)
    setIsSaving(true)
    try {
      const res = await fetch(`/api/documents/${selectedDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent,
        }),
      })

      if (!res.ok) {
        setEditError(await getApiErrorMessage(res, 'Failed to save document'))
        return
      }

      setEditMode(false)
      await selectDocument(selectedDoc.id)
      await fetchTree()
      toast.success('Document saved')
    } catch {
      setEditError('Failed to save document')
    }
    finally {
      setIsSaving(false)
    }
  }

  const confirmDeleteDocument = async () => {
    if (!pendingDelete) return

    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/documents/${pendingDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        setDeleteError(await getApiErrorMessage(res, 'Failed to delete document'))
        return
      }

      if (selectedDoc?.id === pendingDelete.id) {
        setSelectedDoc(null)
      }

      setPendingDelete(null)
      await fetchTree()
      toast.success('Document deleted')
    } catch {
      setDeleteError('Failed to delete document')
    } finally {
      setIsDeleting(false)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startEdit = () => {
    if (!selectedDoc) return
    setEditTitle(selectedDoc.title)
    setEditContent(selectedDoc.content)
    setEditError(null)
    setEditFieldErrors({})
    setEditMode(true)
  }

  const renderTree = (nodes: DocNode[], depth = 0) => {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0
      const isExpanded = expandedIds.has(node.id)
      const isSelected = selectedDoc?.id === node.id

      return (
        <div key={node.id}>
          <button
            onClick={() => {
              selectDocument(node.id)
              if (hasChildren) toggleExpand(node.id)
            }}
            className={`w-full flex items-center gap-1.5 py-1.5 px-2 rounded-md text-sm hover:bg-accent/50 transition-colors ${
              isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground'
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{node.title}</span>
          </button>
          {hasChildren && isExpanded && renderTree(node.children, depth + 1)}
        </div>
      )
    })
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select a project to view documents
      </div>
    )
  }

  return (
    <div className="flex h-full gap-0 bg-background">
      {/* Sidebar - Document Tree */}
      <div className="w-64 border-r flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" />
            Documents
          </h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="New document" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-1">
            {isLoading ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">Loading...</div>
            ) : treeError ? (
              <div className="p-3">
                <InlineAlert
                  tone="danger"
                  action={
                    <Button size="sm" variant="outline" onClick={() => void fetchTree()}>
                      Retry
                    </Button>
                  }
                >
                  {treeError}
                </InlineAlert>
              </div>
            ) : tree.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No documents yet
              </div>
            ) : (
              renderTree(tree)
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {documentError ? (
          <div className="border-b p-3" data-testid="document-load-error">
            <InlineAlert tone="danger">{documentError}</InlineAlert>
          </div>
        ) : null}
        {selectedDoc ? (
          <>
            <div className="flex items-center justify-between px-6 py-3 border-b">
              <div>
                {editMode ? (
                  <div className="space-y-1">
                    <Input
                      value={editTitle}
                      maxLength={MAX_DOCUMENT_TITLE_LENGTH}
                      onChange={(e) => {
                        setEditTitle(e.target.value)
                        setEditFieldErrors((previous) => ({ ...previous, title: undefined }))
                        setEditError(null)
                      }}
                      className="text-lg font-semibold h-9"
                      aria-label="Document title"
                      aria-invalid={Boolean(editFieldErrors.title)}
                    />
                    {editFieldErrors.title ? (
                      <p className="text-xs text-destructive">{editFieldErrors.title}</p>
                    ) : null}
                  </div>
                ) : (
                  <h2 className="text-lg font-semibold">{selectedDoc.title}</h2>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {selectedDoc.lastEditedBy && (
                    <span>Edited by {selectedDoc.lastEditedBy.name}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(selectedDoc.updatedAt).toLocaleDateString()}
                  </span>
                  <Badge variant={selectedDoc.isPublished ? 'default' : 'secondary'} className="text-[10px]">
                    {selectedDoc.isPublished ? 'Published' : 'Draft'}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    v{selectedDoc.version}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {editMode ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Cancel</Button>
                    <Button size="sm" onClick={saveDocument}>Save</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" className="gap-1" onClick={startEdit}>
                      <Edit className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                        aria-label="Delete document"
                      onClick={() => {
                        setDeleteError(null)
                        setPendingDelete({ id: selectedDoc.id, title: selectedDoc.title })
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {editError ? (
              <div className="border-b px-6 py-3" data-testid="document-save-error">
                <InlineAlert tone="danger">{editError}</InlineAlert>
              </div>
            ) : null}
            <ScrollArea className="flex-1 p-6">
              {editMode ? (
                <div className="space-y-1">
                  <Textarea
                    value={editContent}
                    maxLength={MAX_DOCUMENT_CONTENT_LENGTH}
                    onChange={(e) => {
                      setEditContent(e.target.value)
                      setEditFieldErrors((previous) => ({ ...previous, content: undefined }))
                      setEditError(null)
                    }}
                    className="min-h-[400px] font-mono text-sm"
                    placeholder="Write your document in Markdown..."
                    aria-label="Document content"
                    aria-invalid={Boolean(editFieldErrors.content)}
                  />
                  {editFieldErrors.content ? (
                    <p className="text-xs text-destructive">{editFieldErrors.content}</p>
                  ) : null}
                </div>
              ) : (
                <div className="max-w-none text-sm leading-6 text-foreground">
                  {selectedDoc.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ ...props }) => <h1 className="mb-4 text-3xl font-semibold tracking-tight" {...props} />,
                        h2: ({ ...props }) => <h2 className="mb-3 mt-8 text-2xl font-semibold tracking-tight" {...props} />,
                        h3: ({ ...props }) => <h3 className="mb-2 mt-6 text-xl font-semibold" {...props} />,
                        p: ({ ...props }) => <p className="mb-4 text-sm leading-7 text-foreground/95" {...props} />,
                        ul: ({ ...props }) => <ul className="mb-4 list-disc space-y-1 pl-6" {...props} />,
                        ol: ({ ...props }) => <ol className="mb-4 list-decimal space-y-1 pl-6" {...props} />,
                        li: ({ ...props }) => <li className="marker:text-muted-foreground" {...props} />,
                        blockquote: ({ ...props }) => <blockquote className="mb-4 border-l-2 border-primary/30 pl-4 italic text-muted-foreground" {...props} />,
                        code: ({ className, children, ...props }) => {
                          const isBlock = className?.includes('language-')
                          if (isBlock) {
                            return (
                              <code className="block overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-[13px]" {...props}>
                                {children}
                              </code>
                            )
                          }

                          return (
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]" {...props}>
                              {children}
                            </code>
                          )
                        },
                        pre: ({ ...props }) => <pre className="mb-4 overflow-x-auto rounded-lg bg-muted" {...props} />,
                        table: ({ ...props }) => <table className="mb-4 w-full border-collapse overflow-hidden rounded-lg border border-border text-left text-sm" {...props} />,
                        th: ({ ...props }) => <th className="border border-border bg-muted px-3 py-2 font-medium" {...props} />,
                        td: ({ ...props }) => <td className="border border-border px-3 py-2 align-top" {...props} />,
                        a: ({ ...props }) => <a className="text-primary underline underline-offset-4" target="_blank" rel="noreferrer" {...props} />,
                        hr: ({ ...props }) => <hr className="my-6 border-border" {...props} />,
                      }}
                    >
                      {selectedDoc.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-muted-foreground italic">No content yet. Click Edit to add content.</p>
                  )}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a document or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Document Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setCreateError(null)
            setCreateTitleError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Document</DialogTitle>
            <DialogDescription>
              Add a document to the project knowledge base.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {createError ? (
              <div data-testid="document-create-error">
                <InlineAlert tone="danger">{createError}</InlineAlert>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label htmlFor="new-document-title" className="text-sm font-medium">Title</label>
              <Input
                id="new-document-title"
                value={newDocTitle}
                maxLength={MAX_DOCUMENT_TITLE_LENGTH}
                onChange={(e) => {
                  setNewDocTitle(e.target.value)
                  setCreateTitleError(null)
                  setCreateError(null)
                }}
                placeholder="Document title"
                aria-invalid={Boolean(createTitleError)}
                aria-describedby={createTitleError ? 'new-document-title-error' : undefined}
                data-testid="document-create-title-input"
              />
              {createTitleError ? (
                <p id="new-document-title-error" className="text-xs text-destructive">
                  {createTitleError}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createDocument} disabled={isSaving} data-testid="document-create-submit">
              {isSaving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setPendingDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `This will permanently delete "${pendingDelete.title}" and its revision history.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <InlineAlert tone="danger">{deleteError}</InlineAlert> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void confirmDeleteDocument()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
