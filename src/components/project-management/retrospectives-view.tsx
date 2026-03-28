'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  MessageCircle,
  Plus,
  ThumbsUp,
  ArrowUp,
  CheckSquare,
  Smile,
  CloudRain,
  Lightbulb,
} from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'

type RetroItem = {
  id: string
  category: string
  content: string
  author: { id: string; name: string } | null
  voteCount: number
  hasVoted: boolean
}

type Retro = {
  id: string
  title: string
  status: string
  createdAt: string
  facilitator: { id: string; name: string } | null
  iteration: { id: string; name: string } | null
  _count?: { items: number }
}

type RetroDetail = Retro & {
  itemsByCategory: {
    went_well: RetroItem[]
    to_improve: RetroItem[]
    action_item: RetroItem[]
  }
}

const CATEGORIES = [
  { key: 'went_well', label: 'What went well', icon: Smile, color: 'text-green-500', bg: 'bg-green-500/10' },
  { key: 'to_improve', label: 'To improve', icon: CloudRain, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { key: 'action_item', label: 'Action items', icon: Lightbulb, color: 'text-blue-500', bg: 'bg-blue-500/10' },
] as const

export function RetrospectivesView() {
  const { currentProject, iterations } = useAppStore()
  const [retros, setRetros] = useState<Retro[]>([])
  const [selectedRetro, setSelectedRetro] = useState<RetroDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newIterationId, setNewIterationId] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<string>('went_well')
  const [newItemContent, setNewItemContent] = useState('')

  const projectId = currentProject?.id

  const fetchRetros = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/retrospectives?projectId=${projectId}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load retrospectives'))
      }
      setRetros(await res.json())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load retrospectives')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchRetros() }, [fetchRetros])

  const selectRetro = async (id: string) => {
    try {
      const res = await fetch(`/api/retrospectives/${id}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load retrospective'))
      }
      setSelectedRetro(await res.json())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load retrospective')
    }
  }

  const createRetro = async () => {
    if (!projectId || !newTitle.trim() || !newIterationId) return
    try {
      const res = await fetch('/api/retrospectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: newTitle.trim(),
          iterationId: newIterationId,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to create retrospective'))
      }
      const retro = await res.json()
      setCreateOpen(false)
      setNewTitle('')
      await fetchRetros()
      await selectRetro(retro.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create retrospective')
    }
  }

  const addItem = async () => {
    if (!selectedRetro || !newItemContent.trim()) return
    try {
      const res = await fetch('/api/retrospectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retroId: selectedRetro.id,
          category: newItemCategory,
          content: newItemContent.trim(),
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to add retrospective item'))
      }
      setNewItemContent('')
      setAddItemOpen(false)
      await selectRetro(selectedRetro.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add retrospective item')
    }
  }

  const vote = async (itemId: string) => {
    if (!selectedRetro) return
    try {
      const res = await fetch(`/api/retrospectives/${selectedRetro.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to update vote'))
      }
      await selectRetro(selectedRetro.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update vote')
    }
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select a project to view retrospectives
      </div>
    )
  }

  if (selectedRetro) {
    return (
      <div className="p-4 space-y-6 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" className="mb-2 -ml-2 text-xs" onClick={() => setSelectedRetro(null)}>
              ← Back to retrospectives
            </Button>
            <h2 className="text-xl font-semibold">{selectedRetro.title}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              {selectedRetro.iteration && <span>{selectedRetro.iteration.name}</span>}
              <Badge variant="outline" className="text-[10px]">{selectedRetro.status}</Badge>
            </div>
          </div>
          <Button onClick={() => { setNewItemCategory('went_well'); setAddItemOpen(true) }} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const items = selectedRetro.itemsByCategory[cat.key as keyof typeof selectedRetro.itemsByCategory] ?? []
            return (
              <Card key={cat.key}>
                <CardHeader className={`pb-3 ${cat.bg} rounded-t-lg`}>
                  <CardTitle className={`text-sm flex items-center gap-2 ${cat.color}`}>
                    <cat.icon className="h-4 w-4" />
                    {cat.label}
                    <Badge variant="secondary" className="ml-auto text-[10px]">{items.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-3 space-y-2">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No items yet</p>
                  ) : (
                    items
                      .sort((a, b) => b.voteCount - a.voteCount)
                      .map((item) => (
                        <div key={item.id} className="p-3 rounded-md border bg-card text-sm">
                          <p>{item.content}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[11px] text-muted-foreground">
                              {item.author?.name}
                            </span>
                            <Button
                              variant={item.hasVoted ? 'default' : 'outline'}
                              size="sm"
                              className="h-6 text-xs gap-1 px-2"
                              onClick={() => vote(item.id)}
                            >
                              <ThumbsUp className="h-3 w-3" />
                              {item.voteCount}
                            </Button>
                          </div>
                        </div>
                      ))
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-xs text-muted-foreground"
                    onClick={() => { setNewItemCategory(cat.key); setAddItemOpen(true) }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add item
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Add Item Dialog */}
        <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Retro Item</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <Select value={newItemCategory} onValueChange={setNewItemCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Content</label>
                <Textarea
                  value={newItemContent}
                  onChange={(e) => setNewItemContent(e.target.value)}
                  placeholder="Share your thoughts..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancel</Button>
              <Button onClick={addItem} disabled={!newItemContent.trim()}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Retrospectives
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Reflect on sprints and improve</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Retrospective
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Card key={i} className="animate-pulse h-20" />)}
        </div>
      ) : retros.length === 0 ? (
        <Card className="py-16 text-center">
          <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground">No retrospectives yet</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {retros.map((retro) => (
            <Card
              key={retro.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => selectRetro(retro.id)}
            >
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{retro.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {retro.iteration && <span>{retro.iteration.name}</span>}
                    <span>{new Date(retro.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{retro.status}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{retro._count?.items ?? 0} items</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Retro Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Retrospective</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Sprint N Retrospective"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sprint/Iteration</label>
              <Select value={newIterationId} onValueChange={setNewIterationId}>
                <SelectTrigger><SelectValue placeholder="Select sprint" /></SelectTrigger>
                <SelectContent>
                  {iterations.map((it) => (
                    <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createRetro} disabled={!newTitle.trim() || !newIterationId}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
