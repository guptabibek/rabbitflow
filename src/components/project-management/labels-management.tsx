'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tags,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { PRESET_COLORS } from '@/lib/ui-tokens'

export function LabelsManagement({ trigger }: { trigger?: React.ReactNode } = {}) {
  const { currentProject, labels, setLabels } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    if (!currentProject || !name.trim()) return
    setIsCreating(true)
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProject.id, name: name.trim(), color }),
      })
      if (res.ok) {
        const label = await res.json()
        setLabels([...labels, label])
        setName('')
        setColor('#6366f1')
        toast.success('Label created')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to create label')
      }
    } catch {
      toast.error('Network error')
    }
    setIsCreating(false)
  }

  const handleUpdate = async (id: string) => {
    try {
      const res = await fetch(`/api/labels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      })
      if (res.ok) {
        setLabels(labels.map((l) => (l.id === id ? { ...l, name: editName.trim(), color: editColor } : l)))
        setEditingId(null)
        toast.success('Label updated')
      }
    } catch {
      toast.error('Failed to update label')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/labels/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setLabels(labels.filter((l) => l.id !== id))
        toast.success('Label deleted')
      }
    } catch {
      toast.error('Failed to delete label')
    }
  }

  if (!currentProject) return null

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs">
            <Tags className="h-3.5 w-3.5" />
            Labels
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tags className="h-4 w-4 text-primary" />
            Manage Labels
          </DialogTitle>
        </DialogHeader>

        {/* Create form */}
        <div className="px-5 py-4 border-b bg-muted/30 flex-shrink-0">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Label name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <Button
              size="sm"
              className="h-9 px-3"
              onClick={handleCreate}
              disabled={isCreating || !name.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={`h-5 w-5 rounded-md transition-all ${
                  color === c ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        {/* Labels list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-1">
            {labels.map((label) => (
              <div
                key={label.id}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-muted/50 group transition-colors"
              >
                {editingId === label.id ? (
                  <>
                    <div
                      className="h-4 w-4 rounded-full flex-shrink-0 cursor-pointer"
                      style={{ backgroundColor: editColor }}
                    />
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-7 text-sm flex-1"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdate(label.id)}
                    />
                    <div className="flex gap-1">
                      {PRESET_COLORS.slice(0, 5).map((c) => (
                        <button
                          key={c}
                          className={`h-4 w-4 rounded-full ${editColor === c ? 'ring-1 ring-primary' : ''}`}
                          style={{ backgroundColor: c }}
                          onClick={() => setEditColor(c)}
                        />
                      ))}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Save label" onClick={() => handleUpdate(label.id)}>
                      <Check className="h-3 w-3 text-green-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Cancel editing" onClick={() => setEditingId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div
                      className="h-4 w-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 text-sm font-medium">{label.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit label"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        setEditingId(label.id)
                        setEditName(label.name)
                        setEditColor(label.color)
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete label"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => handleDelete(label.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {labels.length === 0 && (
              <div className="text-center py-8">
                <Tags className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No labels yet</p>
                <p className="text-xs text-muted-foreground">Create labels above to categorize work items</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
