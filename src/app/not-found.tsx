import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-8">
      <div className="w-full max-w-md">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <FileQuestion className="h-5 w-5 text-muted-foreground" />
        </div>

        <h1 className="mb-2 text-lg font-semibold text-foreground">Page not found</h1>

        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          This page does not exist, or the work item it pointed to has been deleted or moved to a
          project you cannot access.
        </p>

        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
