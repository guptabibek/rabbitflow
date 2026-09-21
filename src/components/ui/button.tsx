import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Buttons carry the product's action hierarchy, so the variants are named for
 * the job rather than the look:
 *
 *   default     the one action a surface most wants you to take
 *   secondary   a real alternative to the primary action
 *   outline     an action among equals — toolbars, filter controls
 *   ghost       an action that should disappear until it is needed
 *   destructive an action that removes something
 *   link        navigation wearing a button's clothes
 *
 * Only one `default` button belongs on a surface at a time. A screen with four
 * filled buttons has no primary action.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md",
    "font-medium transition-[background-color,border-color,color,box-shadow,opacity] duration-150",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-2xs hover:bg-primary/88 active:bg-primary/95",
        destructive:
          "bg-destructive text-destructive-foreground shadow-2xs hover:bg-destructive/88 focus-visible:outline-destructive",
        outline:
          "border border-input bg-card text-foreground shadow-2xs hover:border-border-strong hover:bg-surface-hover",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-surface-hover",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // 28px — dense toolbars, table row actions, filter bars.
        xs: "h-7 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        // 32px — the workhorse. Matches input height exactly.
        sm: "h-8 px-2.5 text-[13px]",
        // 36px — forms, dialog footers, page-level actions.
        default: "h-9 px-3.5 text-[13px]",
        // 40px — the single hero action on an empty or onboarding surface.
        lg: "h-10 px-5 text-sm",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /**
     * Swaps the leading icon for a spinner and blocks the click without
     * collapsing the label, so the button keeps its width and the row it sits
     * in does not reflow the moment you submit.
     */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  // asChild hands rendering to the caller's element, which cannot host the
  // spinner without breaking Slot's single-child contract.
  if (asChild) {
    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Comp>
    )
  }

  return (
    <button
      data-slot="button"
      data-loading={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export { Button, buttonVariants }
