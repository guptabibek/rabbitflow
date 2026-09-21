"use client"

import * as React from "react"
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A metric is a number someone is going to act on. The pattern this replaces —
 * four 160px cards, each holding one figure beside a large tinted icon square —
 * spent an eighth of the viewport to say four things, and coloured the icons
 * for decoration so the colour carried no meaning.
 *
 * Here: figures share one bordered strip, so they read as a row that can be
 * compared; the label sits above the value because it is what you scan for;
 * and colour appears only when a value has a state worth reacting to.
 */

type Trend = {
  /** Signed change. Direction is derived, so callers never format an arrow. */
  value: number
  label?: string
  /** For metrics where down is good — open bugs, cycle time, breaches. */
  inverted?: boolean
}

export function MetricRow({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="metric-row"
      className={cn(
        // A single bordered strip divided by hairlines, rather than N cards
        // with N shadows. Falls to two columns before it falls to one, so a
        // four-metric row never leaves a single orphan on the last line.
        "grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card",
        "divide-x-0 divide-y sm:divide-y-0 sm:divide-x",
        "sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))] sm:auto-cols-fr sm:grid-flow-col",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function Metric({
  label,
  value,
  /** A short qualifier under the value: "of 18", "3 unassigned", "22% done". */
  hint,
  trend,
  /** Marks the figure itself when its state matters. Default is plain ink. */
  tone = "default",
  icon: Icon,
  onClick,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  trend?: Trend
  tone?: "default" | "success" | "warning" | "danger"
  icon?: React.ElementType
  onClick?: () => void
  className?: string
}) {
  const valueTone = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone]

  const rising = trend ? trend.value > 0 : false
  const flat = trend ? trend.value === 0 : true
  // "Good" is direction times intent, so a falling bug count reads as green
  // and a falling velocity reads as red without either caller special-casing.
  const good = trend?.inverted ? !rising : rising

  const TrendIcon = flat ? ArrowRight : rising ? ArrowUpRight : ArrowDownRight

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {Icon ? (
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : null}
        <span className="type-label truncate">{label}</span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={cn(
            "type-numeric text-[1.375rem] font-semibold leading-none tracking-[-0.02em]",
            valueTone
          )}
        >
          {value}
        </span>

        {trend ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
              flat
                ? "text-muted-foreground"
                : good
                  ? "text-success"
                  : "text-danger"
            )}
          >
            <TrendIcon className="size-3" aria-hidden="true" />
            {Math.abs(trend.value)}
            {trend.label ? (
              <span className="font-normal text-muted-foreground"> {trend.label}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {hint ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "min-w-0 px-3.5 py-3 text-left transition-colors hover:bg-surface-hover",
          "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          className
        )}
      >
        {body}
      </button>
    )
  }

  return <div className={cn("min-w-0 px-3.5 py-3", className)}>{body}</div>
}

/**
 * A labelled proportion — "14 of 18 complete" — as a single bar rather than a
 * chart. Used wherever a pie of two slices would otherwise appear.
 */
export function MeterBar({
  segments,
  className,
  ariaLabel,
}: {
  segments: Array<{ label: string; value: number; className: string }>
  className?: string
  ariaLabel?: string
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  if (total <= 0) return null

  return (
    <div
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken", className)}
      role="img"
      aria-label={
        ariaLabel ??
        segments.map((segment) => `${segment.label}: ${segment.value}`).join(", ")
      }
    >
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment) => (
          <div
            key={segment.label}
            className={cn("h-full", segment.className)}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
    </div>
  )
}
