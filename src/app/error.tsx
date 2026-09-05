'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RotateCw } from 'lucide-react'

/**
 * Route-level error boundary.
 *
 * The application previously had none, so a render-time exception anywhere in
 * the (very large) client component tree unmounted the whole product and left a
 * blank page with no recovery path.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled view error:', error)
  }, [error])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-8">
      <div className="w-full max-w-md">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>

        <h1 className="mb-2 text-lg font-semibold text-foreground">Something went wrong</h1>

        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          This view failed to render. Your data is safe — nothing was saved or changed by this
          error. Try again, or return to the dashboard.
        </p>

        {error.digest && (
          <p className="mb-6 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={reset} className="gap-2">
            <RotateCw className="h-3.5 w-3.5" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = '/dashboard')}>
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
