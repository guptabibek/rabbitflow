import { Skeleton } from '@/components/ui/skeleton'

/**
 * Holds the same outer geometry as the authenticated project workspace while
 * App Router and the client bootstrap resolve. Keeping this in one component
 * prevents the streamed route fallback and the hydrated fallback from
 * disagreeing about header, sidebar, or content placement.
 */
export function WorkspaceShellSkeleton() {
  return (
    <div
      className="flex h-dvh overflow-hidden bg-background"
      role="status"
      aria-label="Loading project workspace"
      data-testid="workspace-shell-skeleton"
    >
      <div
        className="hidden w-[13.5625rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex"
        data-testid="workspace-shell-skeleton-sidebar"
      >
        <div className="flex h-12 items-center gap-2 border-b border-sidebar-border px-3">
          <Skeleton className="size-6 rounded-md" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="space-y-1 p-2">
          <Skeleton className="h-7 w-full" />
          <div className="pt-3" />
          <Skeleton className="h-2.5 w-10" />
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4"
          data-testid="workspace-shell-skeleton-toolbar"
        >
          <Skeleton className="h-4 w-52" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
        </div>

        <div className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-2 h-5 w-44" />
        </div>

        <div className="flex-1 space-y-4 p-4 sm:p-6">
          <Skeleton className="h-[4.75rem] w-full" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 lg:col-span-2" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Matches the project directory's 48px chrome, page header, and card grid. */
export function ProjectDirectorySkeleton() {
  return (
    <div
      className="flex min-h-dvh flex-col bg-background"
      role="status"
      aria-label="Loading projects"
      data-testid="project-directory-skeleton"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-6 rounded-md" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-7 w-24 rounded-md" />
      </div>

      <div className="shrink-0 border-b border-border bg-background">
        <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-2 h-3 w-full max-w-xl" />
          </div>
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      <main className="w-full flex-1 px-4 py-4 sm:px-6 sm:py-5">
        <Skeleton className="mb-4 h-8 w-full max-w-sm" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-[7.5rem] w-full" />
          ))}
        </div>
      </main>
    </div>
  )
}
