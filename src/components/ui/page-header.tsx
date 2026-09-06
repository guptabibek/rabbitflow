"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Every working surface in this product answers three questions in the same
 * place: where am I, what is this, and what can I do here. Before this
 * component the answers were scattered — Reports had a title, the board and
 * the list had nothing at all, and the backlog invented a third layout.
 *
 * Consistency here is not uniformity: the header composes from optional parts,
 * so a dense board can ship a one-line bar while a settings page gets a
 * breadcrumb, a description and a row of tabs, all on the same grid.
 */

export type Crumb = {
  label: string
  onClick?: () => void
  href?: string
}

function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const interactive = !isLast && (item.onClick || item.href)

          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {interactive ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  className={cn(
                    "max-w-[14rem] truncate rounded-sm px-1 py-0.5 -mx-1 transition-colors",
                    "hover:bg-accent hover:text-foreground",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  )}
                >
                  {item.label}
                </button>
              ) : (
                <span
                  className={cn("max-w-[16rem] truncate", isLast && "text-foreground")}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast ? (
                <ChevronRight
                  className="size-3 shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function PageHeader({
  breadcrumbs,
  title,
  description,
  /** Status chips, counts, owners — the facts that qualify the title. */
  meta,
  /** Buttons. The rightmost is the primary; there should be exactly one. */
  actions,
  /** A tab strip or filter row that belongs to this page, flush to the rule. */
  tabs,
  /** Drops the bottom rule when the surface below draws its own. */
  bordered = true,
  sticky = false,
  className,
  children,
}: {
  breadcrumbs?: Crumb[]
  title: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  tabs?: React.ReactNode
  bordered?: boolean
  sticky?: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "shrink-0 bg-background",
        bordered && "border-b border-border",
        sticky && "sticky top-0 z-20",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 px-4 pb-3 pt-3 sm:px-6">
        {/*
          basis-full below sm so the title claims its own row and the actions
          wrap beneath it. With flex-1 alone the title just shrank, and a
          project called "Apex Platform" rendered as "Apex Plat..." next to two
          buttons that had taken the space.
        */}
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <div className="mb-1">
              <Breadcrumbs items={breadcrumbs} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="type-display min-w-0 truncate text-foreground">{title}</h1>
            {meta ? (
              <div className="flex flex-wrap items-center gap-1.5">{meta}</div>
            ) : null}
          </div>

          {description ? (
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}

      </div>

      {children}

      {/* Flush to the bottom rule so the strip reads as part of the header
          rather than as a floating control bar. */}
      {tabs ? <div className="px-4 sm:px-6">{tabs}</div> : null}
    </header>
  )
}

/**
 * The strip directly under a page header: search, filters, view switches, and
 * a bulk-action bar when a selection is live. Separate from the header so a
 * page can have one, both, or neither.
 */
export function PageToolbar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-toolbar"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2 sm:px-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** Pushes what follows to the right edge of a toolbar. */
export function ToolbarSpacer() {
  return <div className="ml-auto" aria-hidden="true" />
}

/**
 * A vertical hairline between groups of toolbar controls. Cheaper to read than
 * spacing alone once a toolbar has more than about five controls.
 */
export function ToolbarDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("mx-0.5 h-5 w-px shrink-0 bg-border", className)}
    />
  )
}

/** The scrolling body of a page. Owns the page gutter so views do not. */
export function PageBody({
  className,
  padded = true,
  children,
  ...props
}: React.ComponentProps<"div"> & { padded?: boolean }) {
  return (
    <div
      data-slot="page-body"
      className={cn(
        "min-h-0 flex-1 overflow-auto",
        padded && "px-4 py-4 sm:px-6 sm:py-5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
