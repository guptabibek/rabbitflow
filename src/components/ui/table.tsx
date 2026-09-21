"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Tables are the surface this product lives on, so they get a real component
 * rather than a styled <table>.
 *
 * Three things the stock version got wrong for an application of this density:
 *
 *   • The header scrolled away. In a 200-row backlog that means guessing which
 *     column you are reading. The header is sticky by default.
 *   • Every cell was `whitespace-nowrap`, so a long title forced horizontal
 *     scroll on the whole table instead of truncating in its own column.
 *   • Row height came from padding on each cell, so a row with a badge in it
 *     was taller than a row without, and the rhythm broke wherever the data
 *     changed. Height is set on the row.
 */

type Density = "compact" | "default" | "comfortable"

const DensityContext = React.createContext<Density>("default")

const rowHeight: Record<Density, string> = {
  compact: "h-8",
  default: "h-10",
  comfortable: "h-12",
}

const cellPadding: Record<Density, string> = {
  compact: "px-2",
  default: "px-3",
  comfortable: "px-3.5",
}

function Table({
  className,
  containerClassName,
  density = "default",
  ...props
}: React.ComponentProps<"table"> & {
  containerClassName?: string
  density?: Density
}) {
  return (
    <DensityContext.Provider value={density}>
      <div
        data-slot="table-container"
        className={cn("relative w-full overflow-auto", containerClassName)}
      >
        <table
          data-slot="table"
          className={cn(
            "w-full caption-bottom border-separate border-spacing-0 text-[13px]",
            className
          )}
          {...props}
        />
      </div>
    </DensityContext.Provider>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("sticky top-0 z-10 bg-surface-sunken", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "sticky bottom-0 bg-surface-sunken font-medium [&_td]:border-t [&_td]:border-border",
        className
      )}
      {...props}
    />
  )
}

function TableRow({
  className,
  selected,
  ...props
}: React.ComponentProps<"tr"> & { selected?: boolean }) {
  const density = React.useContext(DensityContext)

  return (
    <tr
      data-slot="table-row"
      data-state={selected ? "selected" : undefined}
      className={cn(
        rowHeight[density],
        "group/row transition-colors duration-100",
        // Border on the cells, not the row: a border on <tr> is ignored under
        // border-collapse: separate, which is what keeps the header sticky.
        "[&>td]:border-b [&>td]:border-border/60",
        "hover:bg-surface-hover",
        // The selected row is marked by a tint plus an accent rail on the
        // first cell, so selection survives being hovered.
        "data-[state=selected]:bg-primary-muted",
        "data-[state=selected]:[&>td:first-child]:shadow-[inset_2px_0_0_0_var(--primary)]",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  align = "left",
  ...props
}: React.ComponentProps<"th"> & { align?: "left" | "right" | "center" }) {
  const density = React.useContext(DensityContext)

  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-8 border-b border-border bg-surface-sunken align-middle",
        "text-[11px] font-semibold uppercase tracking-[0.055em] text-muted-foreground",
        "whitespace-nowrap select-none",
        cellPadding[density],
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        "[&:has([role=checkbox])]:w-8 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  align = "left",
  ...props
}: React.ComponentProps<"td"> & { align?: "left" | "right" | "center" }) {
  const density = React.useContext(DensityContext)

  return (
    <td
      data-slot="table-cell"
      className={cn(
        "align-middle",
        cellPadding[density],
        align === "right" && "text-right tabular-nums",
        align === "center" && "text-center",
        "[&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
