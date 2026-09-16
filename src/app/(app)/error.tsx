'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Last-resort error boundary for everything under `(app)` -- Ruling R10,
 * added after Task 8's review surfaced that none existed anywhere in the
 * app. Without this, any uncaught render error or server-action rejection
 * under an authenticated route was a blank white screen, for every page --
 * exactly the "dead end" this milestone's onboarding work was built to
 * avoid, just one layer up.
 *
 * A Next.js App Router constraint, not a gap: `error.tsx` wraps the pages
 * and nested layouts *inside* its own segment, but not `(app)/layout.tsx`
 * itself -- an error thrown there is not caught here.
 *
 * The raw error is never shown to the user (it can carry anything a thrown
 * value can carry) but is logged so it is recoverable from the server/dev
 * console.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-10 text-center">
      <h1 className="font-display text-3xl">Something went wrong</h1>
      <p className="mt-2 text-[var(--color-text-muted)]">
        That&rsquo;s on us, not you. Nothing you were working on should be lost -- try again.
      </p>
      <Button type="button" onClick={reset} className="mt-8">
        Try again
      </Button>
    </div>
  )
}
