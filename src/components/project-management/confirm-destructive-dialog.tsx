'use client'

import { useCallback, useState, type ReactNode } from 'react'
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

/**
 * Shared confirmation for irreversible actions.
 *
 * Eight of the twelve components with delete actions previously deleted on a
 * single click — ACL rules, automation rules, labels, recurring tasks, SLA
 * policies, test plans, webhooks and git links — none of which are undoable, and
 * several of which (labels, ACL rules) change behaviour far beyond the row the
 * user clicked.
 */

type ConfirmDestructiveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What is being acted on, e.g. "Delete webhook". */
  title: string
  /** Consequences in plain language, including anything affected beyond this row. */
  description: ReactNode
  /** Label for the confirming button. Defaults to "Delete". */
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
}

export function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
}: ConfirmDestructiveDialogProps) {
  const [isPending, setIsPending] = useState(false)

  const handleConfirm = useCallback(async () => {
    setIsPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      // Reset regardless of outcome so a failed action can be retried rather
      // than leaving the dialog stuck in a pending state.
      setIsPending(false)
    }
  }, [onConfirm, onOpenChange])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Keep the dialog open while the request is in flight so the
              // pending state is visible and double-submits are impossible.
              event.preventDefault()
              void handleConfirm()
            }}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * State helper for the common "click delete on a row, confirm, then act" flow.
 *
 * Keeps the pending target alongside the open state so the dialog can name the
 * specific object rather than showing a generic warning.
 */
export function useDestructiveConfirm<T>() {
  const [target, setTarget] = useState<T | null>(null)

  return {
    target,
    isOpen: target !== null,
    request: setTarget,
    dismiss: useCallback(() => setTarget(null), []),
    onOpenChange: useCallback((open: boolean) => {
      if (!open) setTarget(null)
    }, []),
  }
}
