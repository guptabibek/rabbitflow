'use client'

import { ArrowRight, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { BoardStatus } from '@/lib/domain/work-item-view'

export function WorkItemMoveMenu({
  issueKey,
  options,
  onMove,
  disabled = false,
}: {
  issueKey: string
  options: Array<{ id: BoardStatus; label: string }>
  onMove: (status: BoardStatus) => void
  disabled?: boolean
}) {
  if (options.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Move ${issueKey} to another column`}
          disabled={disabled}
          className="-mr-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem key={option.id} onSelect={() => onMove(option.id)}>
            <ArrowRight aria-hidden="true" />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
