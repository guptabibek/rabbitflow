'use client'

import { memo } from 'react'
import { Issue, useAppStore } from '@/store/app-store'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { MessageSquare, UserPlus } from 'lucide-react'
import {
  PriorityIndicator,
  TypeIcon,
} from '@/components/project-management/work-item-indicators'

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

  const dragging = isSortableDragging || isDragging
  const assigneeName = issue.assignee?.name ?? null
  const comments = issue._count?.comments ?? 0

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-roledescription="Draggable card"
      aria-label={`${issue.key}: ${issue.title}`}
      tabIndex={0}
      className={cn(
        'group cursor-pointer rounded-md border border-border bg-card p-2.5',
        'transition-[border-color,box-shadow,transform] duration-150',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        dragging
          // The lifted card is the one place a heavy shadow earns its keep: it
          // has genuinely left the column and is floating over the board.
          ? 'rotate-[0.4deg] border-primary/40 opacity-95 shadow-xl'
          : 'hover:border-border-strong hover:shadow-sm'
      )}
      onClick={() => openWorkItem(issue.id)}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <TypeIcon type={issue.workItemType} />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {issue.key}
        </span>
        {/* Priority as an ordered chevron rather than a coloured word: at card
            scale a tinted "Medium" pill was the loudest thing on the board and
            it out-shouted the title. */}
        <PriorityIndicator priority={issue.priority} showLabel={false} />
      </div>

      <p className="mb-2 line-clamp-3 text-[13px] font-medium leading-snug text-foreground">
        {issue.title}
      </p>

      {issue.labels && issue.labels.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {issue.labels.slice(0, 3).map(({ label }) => (
            <span
              key={label.id}
              className="inline-flex max-w-[7rem] items-center gap-1 rounded-sm border border-border px-1 py-px text-[10px] text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              <span className="truncate">{label.name}</span>
            </span>
          ))}
          {issue.labels.length > 3 ? (
            <span className="text-[10px] text-muted-foreground">
              +{issue.labels.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {/*
            The unassigned state used to be a bare dashed circle with no label
            and no tooltip — a glyph that said nothing to anyone who had not
            been told what it meant. It now names itself on hover and to a
            screen reader.
          */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                {issue.assignee ? (
                  <Avatar className="size-5">
                    <AvatarImage src={issue.assignee.avatar || undefined} />
                    <AvatarFallback className="bg-primary-muted text-[9px] font-semibold text-primary">
                      {issue.assignee.name
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <span className="flex size-5 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground">
                    <UserPlus className="size-2.5" aria-hidden="true" />
                  </span>
                )}
                <span className="sr-only">
                  {assigneeName ? `Assigned to ${assigneeName}` : 'Unassigned'}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {assigneeName ? `Assigned to ${assigneeName}` : 'Unassigned'}
            </TooltipContent>
          </Tooltip>

          {comments > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <MessageSquare className="size-3" aria-hidden="true" />
                  <span className="tabular-nums">{comments}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {comments} {comments === 1 ? 'comment' : 'comments'}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {issue.iteration ? (
            <span className="max-w-[6rem] truncate rounded-sm bg-surface-sunken px-1.5 py-px text-[10px] text-muted-foreground">
              {issue.iteration.name}
            </span>
          ) : null}
          {/*
            Story points sat in an unlabelled grey circle that read as a
            notification badge. Labelled and set in the mono face, it reads as
            an estimate.
          */}
          {issue.storyPoints != null ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="rounded-sm bg-surface-sunken px-1.5 py-px font-mono text-[10px] font-medium tabular-nums text-foreground">
                  {issue.storyPoints}
                  <span className="ml-0.5 text-muted-foreground">pt</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>{issue.storyPoints} story points</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </article>
  )
})
