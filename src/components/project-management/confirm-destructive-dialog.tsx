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
import { InlineAlert } from '@/components/ui/states'

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
  /** Return false or an error message when the operation fails and the dialog should stay open. */
  onConfirm: () => boolean | void | string | Promise<boolean | void | string>
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
  const [failureMessage, setFailureMessage] = useState<string | null>(null)

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) setFailureMessage(null)
    onOpenChange(nextOpen)
  }, [onOpenChange])

  const handleConfirm = useCallback(async () => {
    setFailureMessage(null)
    setIsPending(true)
    try {
      const succeeded = await onConfirm()
      if (typeof succeeded === 'string') {
        setFailureMessage(succeeded)
      } else if (succeeded === false) {
        setFailureMessage('The action did not complete. Review the problem and try again.')
      } else {
        handleOpenChange(false)
      }
    } catch (error) {
      setFailureMessage(
        error instanceof Error && error.message
          ? error.message
          : 'The action did not complete. Try again.'
      )
    } finally {
      // Reset regardless of outcome so a failed action can be retried rather
      // than leaving the dialog stuck in a pending state.
      setIsPending(false)
    }
  }, [handleOpenChange, onConfirm])

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {failureMessage ? (
          <InlineAlert tone="danger" title="Action failed.">
            {failureMessage}
          </InlineAlert>
        ) : null}
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
