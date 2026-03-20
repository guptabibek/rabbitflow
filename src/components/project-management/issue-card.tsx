'use client'

import { memo } from 'react'
import { useRouter } from 'next/navigation'
import { Issue } from '@/store/app-store'
import { canonicalWorkItemRoute } from '@/lib/domain/work-item-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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

const priorityConfig = {
  lowest: { color: 'text-slate-400', bg: 'bg-slate-400/10' },
  low: { color: 'text-slate-500', bg: 'bg-slate-500/10' },
  medium: { color: 'text-amber-500', bg: 'bg-amber-500/10' },
  high: { color: 'text-orange-500', bg: 'bg-orange-500/10' },
  highest: { color: 'text-red-500', bg: 'bg-red-500/10' },
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
  task: 'text-emerald-500',
  bug: 'text-red-500',
  story: 'text-violet-500',
  epic: 'text-indigo-500',
  feature: 'text-cyan-500',
  issue: 'text-orange-500',
  design_doc: 'text-teal-500',
  release_item: 'text-orange-500',
}

interface IssueCardProps {
  issue: Issue
  isDragging?: boolean
}

export const IssueCard = memo(function IssueCard({ issue, isDragging }: IssueCardProps) {
  const router = useRouter()

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
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group bg-card border border-border rounded-lg p-3 cursor-pointer transition-all duration-150 ${
        isSortableDragging || isDragging
          ? 'opacity-60 shadow-xl ring-2 ring-primary/30 scale-[1.02]'
          : 'hover:border-primary/30 hover:shadow-sm'
      }`}
      onClick={() => router.push(canonicalWorkItemRoute(issue.id))}
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
    </div>
  )
})
