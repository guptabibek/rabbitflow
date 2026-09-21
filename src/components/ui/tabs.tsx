"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * Two tab treatments, because they answer different questions:
 *
 *   underline  "which part of this page am I looking at" — the default, for
 *              page-level sections. Reads as navigation, sits directly on the
 *              page header, and never boxes the content below it.
 *   segmented  "which mode is this control in" — for switching a view's shape
 *              (board vs list, week vs month). Reads as a control.
 *
 * The stock list was segmented-only and stretched every trigger to fill its
 * container, so nine report sections spread across 1200px with no relationship
 * between a tab's width and its importance.
 */

type TabsVariant = "underline" | "segmented"

const TabsVariantContext = React.createContext<TabsVariant>("underline")

function Tabs({
  className,
  variant = "underline",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & {
  variant?: TabsVariant
}) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-variant={variant}
        className={cn("flex flex-col gap-4", className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const variant = React.useContext(TabsVariantContext)

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex items-center",
        variant === "underline" &&
          // Scrolls rather than wraps: a wrapped tab strip changes the page's
          // vertical rhythm the moment someone narrows the window.
          "-mb-px w-full gap-0.5 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        variant === "segmented" &&
          "h-8 w-fit gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext)

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium",
        "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        variant === "underline" && [
          "relative h-9 rounded-t-sm px-3 text-[13px] text-muted-foreground",
          "hover:text-foreground",
          // The indicator is a box-shadow rather than a border so it overlaps
          // the list's own bottom rule instead of adding a second line.
          "data-[state=active]:text-foreground",
          "data-[state=active]:shadow-[inset_0_-2px_0_0_var(--primary)]",
        ],
        variant === "segmented" && [
          "h-7 rounded-[5px] px-2.5 text-xs text-muted-foreground",
          "hover:text-foreground",
          "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-2xs",
        ],
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none data-[state=active]:animate-view-in", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
