import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * A badge states a fact about the thing it sits on — a status, a role, a
 * count. It is never a button and never decoration.
 *
 * `default` is deliberately not the filled primary colour: a filled accent
 * badge competes with the one filled accent button on the surface, and in a
 * table of forty rows it wins. Solid fills are reserved for `solid` and
 * `destructive`, which are for the rare badge that must interrupt scanning.
 */
const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap",
    "rounded-sm border px-1.5 py-px text-[11px] font-medium leading-[1.45]",
    "transition-colors duration-150",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ],
  {
    variants: {
      variant: {
        default:
          "border-border bg-surface-sunken text-muted-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border-strong bg-transparent text-muted-foreground",
        solid: "border-transparent bg-primary text-primary-foreground",
        success: "border-transparent bg-success-bg text-success",
        warning: "border-transparent bg-warning-bg text-warning",
        destructive: "border-transparent bg-danger-bg text-danger",
        info: "border-transparent bg-info-bg text-info",
        /** For counts sitting beside a label — nav badges, column totals. */
        count:
          "min-w-[1.25rem] rounded-full border-transparent bg-surface-sunken px-1.5 text-[11px] tabular-nums text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
