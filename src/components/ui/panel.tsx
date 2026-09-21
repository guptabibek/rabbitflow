"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The grouping primitive for content inside a page.
 *
 * `Card` is still available and still used, but it defaults to a shadow and
 * generous padding that suits a marketing page, and the audit found it nested
 * two and three deep — a card of cards of cards. A Panel is flatter by
 * default: a hairline, a surface tone, no shadow. Depth comes from tone, and
 * a nested Panel steps down to `plain` so nesting never restates the border.
 */

type Tone = "default" | "sunken" | "plain"

const tones: Record<Tone, string> = {
  default: "border border-border bg-card",
  sunken: "border border-border bg-surface-sunken",
  plain: "border-0 bg-transparent",
}

export function Panel({
  tone = "default",
  className,
  ...props
}: React.ComponentProps<"section"> & { tone?: Tone }) {
  return (
    <section
      data-slot="panel"
      className={cn("flex min-w-0 flex-col rounded-lg", tones[tone], className)}
      {...props}
    />
  )
}

/**
 * A panel's header. `actions` sits opposite the title on the same baseline
 * rather than wrapping below it, which is what kept panel headers from lining
 * up across a two-column dashboard.
 */
export function PanelHeader({
  title,
  description,
  actions,
  icon: Icon,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  icon?: React.ElementType
}) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex items-start justify-between gap-3 px-3.5 py-2.5",
        // Only draws the rule when there is a body under it.
        "border-b border-border last:border-b-0",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? (
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : null}
        <div className="min-w-0">
          {title ? <h2 className="type-heading truncate text-foreground">{title}</h2> : null}
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      {children}
    </div>
  )
}

export function PanelBody({
  padded = true,
  className,
  ...props
}: React.ComponentProps<"div"> & { padded?: boolean }) {
  return (
    <div
      data-slot="panel-body"
      className={cn("min-w-0 flex-1", padded && "p-3.5", className)}
      {...props}
    />
  )
}

export function PanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-footer"
      className={cn(
        "flex items-center gap-2 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

/**
 * A titled band inside a long form or detail page. Not a card — no border, no
 * background — because sections of one form are one thing, and boxing each of
 * them is what makes a settings page look like a filing cabinet.
 */
export function FieldSection({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("py-4 first:pt-0 last:pb-0", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="type-heading text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}
