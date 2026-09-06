"use client"

import * as React from "react"
import { AlertTriangle, RefreshCw, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Empty, error and loading are states of the same surface, so they live
 * together and share a silhouette. A view that swaps between them should not
 * appear to change shape.
 *
 * The rule for empty states: never say "no data". Say what is missing, why it
 * might be missing, and what to do about it — and where there is something to
 * do, put the button here rather than making the user hunt for it in a
 * toolbar they have not learned yet.
 */

type Size = "sm" | "md" | "lg"

const sizing: Record<Size, { wrap: string; icon: string; iconBox: string }> = {
  sm: { wrap: "px-4 py-8", icon: "size-4", iconBox: "size-8" },
  md: { wrap: "px-6 py-12", icon: "size-5", iconBox: "size-10" },
  lg: { wrap: "px-6 py-20", icon: "size-6", iconBox: "size-12" },
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = "md",
  className,
  children,
}: {
  icon?: LucideIcon
  title: string
  /** What is empty and why. One or two sentences — this is not a tour. */
  description?: React.ReactNode
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  size?: Size
  className?: string
  children?: React.ReactNode
}) {
  const s = sizing[size]

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        s.wrap,
        className
      )}
    >
      {Icon ? (
        <div
          aria-hidden="true"
          className={cn(
            "mb-3 flex items-center justify-center rounded-lg border border-border bg-surface-sunken text-muted-foreground",
            s.iconBox
          )}
        >
          <Icon className={s.icon} />
        </div>
      ) : null}

      <p className="type-heading text-foreground">{title}</p>

      {description ? (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}

      {children}
    </div>
  )
}

/**
 * What the user sees when a request fails.
 *
 * `detail` is the technical message. It is shown, because hiding it from an
 * engineer debugging their own delivery tool wastes everyone's time — but it
 * is demoted to small monospace under the plain-language explanation, never
 * used as the headline, and it never replaces the recovery action.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "The request did not complete. This is usually temporary.",
  detail,
  onRetry,
  retryLabel = "Try again",
  action,
  size = "md",
  className,
}: {
  title?: string
  description?: React.ReactNode
  detail?: string | null
  onRetry?: () => void
  retryLabel?: string
  action?: React.ReactNode
  size?: Size
  className?: string
}) {
  const s = sizing[size]

  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        s.wrap,
        className
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "mb-3 flex items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger",
          s.iconBox
        )}
      >
        <AlertTriangle className={s.icon} />
      </div>

      <p className="type-heading text-foreground">{title}</p>

      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>

      {detail ? (
        <p className="mt-2 max-w-md truncate font-mono text-[11px] text-muted-foreground/80">
          {detail}
        </p>
      ) : null}

      {onRetry || action ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw />
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  )
}

/**
 * A non-blocking failure: the page still works, but one part of it is stale.
 * Sits inline above the content it describes rather than stealing the view.
 */
export function InlineAlert({
  tone = "warning",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success"
  title?: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  const tones = {
    info: "border-info-border bg-info-bg text-info",
    warning: "border-warning-border bg-warning-bg text-warning",
    danger: "border-danger-border bg-danger-bg text-danger",
    success: "border-success-border bg-success-bg text-success",
  } as const

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 text-[13px]",
        tones[tone],
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {title ? <span className="font-medium">{title} </span> : null}
        <span className="text-foreground/85">{children}</span>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
