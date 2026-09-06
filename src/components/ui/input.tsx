import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The element-level rules in globals.css already give every `<input>` in the
 * product its height, border, focus ring and disabled treatment, so this
 * component exists to add what a bare element cannot: an optional leading icon
 * and a trailing slot, without every caller re-deriving the padding.
 */
function Input({
  className,
  containerClassName,
  type,
  icon,
  trailing,
  ...props
}: React.ComponentProps<"input"> & {
  icon?: React.ReactNode
  trailing?: React.ReactNode
  /**
   * Sizing for the wrapper an icon or trailing slot introduces. Without it the
   * wrapper is always full-width and swallows the width the caller set on the
   * field — which is what pushed the work-item search onto its own row and
   * made the filter bar two rows deep at every viewport.
   */
  containerClassName?: string
}) {
  const field = (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0",
        icon && "pl-8",
        trailing && "pr-8",
        className
      )}
      {...props}
    />
  )

  if (!icon && !trailing) return field

  return (
    <div
      data-slot="input-wrapper"
      className={cn("relative flex w-full items-center", containerClassName)}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 flex text-muted-foreground [&_svg]:size-3.5"
        >
          {icon}
        </span>
      ) : null}
      {field}
      {trailing ? (
        <span className="absolute right-1.5 flex items-center text-muted-foreground">
          {trailing}
        </span>
      ) : null}
    </div>
  )
}

export { Input }
