import { cn } from "@/lib/utils"

/**
 * A skeleton is a promise about layout, not a loading spinner in disguise. It
 * should occupy the space the real content will occupy, so nothing jumps when
 * the data lands.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse-soft rounded-md bg-surface-hover", className)}
      {...props}
    />
  )
}

/** A line of text. `w` mimics the ragged right edge of real prose. */
function SkeletonText({
  className,
  lines = 1,
  ...props
}: React.ComponentProps<"div"> & { lines?: number }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-9/12"]

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3", widths[index % widths.length])}
        />
      ))}
    </div>
  )
}

/**
 * Rows that match the real table's height and column rhythm, so the header
 * stays put and the page does not resize the moment results arrive.
 */
function SkeletonTable({
  rows = 8,
  columns = 5,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  // Uneven widths across columns, seeded by position, so the placeholder reads
  // as data rather than as a striped pattern.
  const widths = ["w-16", "w-full", "w-20", "w-14", "w-24", "w-12"]

  return (
    <div
      className={cn("w-full", className)}
      role="status"
      aria-label="Loading results"
    >
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex h-10 items-center gap-3 border-b border-border/60 px-3"
        >
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <div
              key={columnIndex}
              className={cn(
                columnIndex === 1 ? "flex-1" : "shrink-0",
                widths[(rowIndex + columnIndex) % widths.length]
              )}
            >
              <Skeleton className="h-2.5 w-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonText, SkeletonTable }
