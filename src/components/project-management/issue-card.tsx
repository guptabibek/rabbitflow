'use client'

import { memo } from 'react'
import { Issue, useAppStore } from '@/store/app-store'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getTypeText } from '@/lib/ui-tokens'
import {
  Bug,
  CheckCircle2,
  CircleDot,
  Flag,
  Layers,
  MessageSquare,
  PackageCheck,
  Rocket,
  Star,
} from 'lucide-react'

const priorityConfig: Record<string, { color: string; bg: string }> = {
  lowest: { color: 'text-priority-lowest', bg: 'bg-priority-lowest-bg' },
  low: { color: 'text-priority-low', bg: 'bg-priority-low-bg' },
  medium: { color: 'text-priority-medium', bg: 'bg-priority-medium-bg' },
  high: { color: 'text-priority-high', bg: 'bg-priority-high-bg' },
  highest: { color: 'text-priority-highest', bg: 'bg-priority-highest-bg' },
}

const typeIcons: Record<string, React.ElementType> = {
  task: CheckCircle2,
  bug: Bug,
  story: Star,
  epic: Layers,
  feature: Flag,
  issue: CircleDot,
  design_doc: Rocket,
  release_item: PackageCheck,
}

const typeColors: Record<string, string> = {
  task: 'text-type-task',
  bug: 'text-type-bug',
  story: 'text-type-story',
  epic: 'text-type-epic',
  feature: 'text-type-feature',
  issue: 'text-type-issue',
  design_doc: 'text-type-design-doc',
  release_item: 'text-type-release-item',
}

interface IssueCardProps {
  issue: Issue
  isDragging?: boolean
}

export const IssueCard = memo(function IssueCard({ issue, isDragging }: IssueCardProps) {
  const openWorkItem = useAppStore((s) => s.openWorkItem)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: issue.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const TypeIcon = typeIcons[issue.workItemType] || CheckCircle2

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-roledescription="Draggable card"
      aria-label={`${issue.key}: ${issue.title}`}
      tabIndex={0}
      className={`group bg-card border border-border rounded-lg p-3 cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isSortableDragging || isDragging
          ? 'opacity-60 shadow-xl ring-2 ring-primary/30 scale-[1.02]'
          : 'hover:border-primary/30 hover:shadow-sm'
      }`}
      onClick={() => openWorkItem(issue.id)}
    >
      {/* Header: type icon + key + priority */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TypeIcon className={`h-3.5 w-3.5 flex-shrink-0 ${typeColors[issue.workItemType] || 'text-muted-foreground'}`} />
          <span className="text-xs text-muted-foreground font-mono truncate">
            {issue.key}
          </span>
        </div>
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 h-5 capitalize font-medium border-0 ${priorityConfig[issue.priority]?.bg || ''} ${priorityConfig[issue.priority]?.color || ''}`}
        >
          {issue.priority}
        </Badge>
      </div>

      {/* Title */}
      <p className="text-sm font-medium leading-snug line-clamp-2 text-foreground mb-2">
        {issue.title}
      </p>

      {/* Labels */}
      {issue.labels && issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {issue.labels.slice(0, 2).map(({ label }) => (
            <Badge
              key={label.id}
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 font-normal"
              style={{ borderColor: label.color + '60', color: label.color }}
            >
              {label.name}
            </Badge>
          ))}
          {issue.labels.length > 2 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
              +{issue.labels.length - 2}
            </Badge>
          )}
        </div>
      )}

      {/* Footer: assignee + meta */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <div className="flex items-center gap-2">
          {issue.assignee ? (
            <Avatar className="h-5 w-5">
              <AvatarImage src={issue.assignee.avatar || undefined} />
              <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-medium">
                {issue.assignee.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/30" />
          )}
          {issue._count?.comments ? (
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              <span className="text-[10px]">{issue._count.comments}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {issue.storyPoints != null && (
            <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full h-5 w-5 flex items-center justify-center">
              {issue.storyPoints}
            </span>
          )}
          {issue.iteration && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal max-w-[80px] truncate">
              {issue.iteration.name}
            </Badge>
          )}
        </div>
      </div>
    </article>
  )
})
