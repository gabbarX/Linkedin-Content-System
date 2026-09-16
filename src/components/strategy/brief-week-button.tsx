'use client'

import { Loader2 } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

/** Structurally identical to `StrategyActionResult` in
 * `src/server/strategy/actions.ts`; declared locally, same pattern as
 * `strategy-builder.tsx`. */
type StrategyActionResult = { ok: true } | { ok: false; message: string }

const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Your strategy is untouched -- try again in a moment.'

export type BriefWeekButtonProps = {
  weekIndex: number
  briefUpcomingWeek: () => Promise<StrategyActionResult>
}

/**
 * The retry for a week whose full briefs were not written during the build
 * (Task 7). One model call; on success the action revalidates the page and
 * the re-rendered slots arrive in the same response, so there is nothing
 * for this component to do but clear its own error.
 */
export function BriefWeekButton({ weekIndex, briefUpcomingWeek }: BriefWeekButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await briefUpcomingWeek()
        if (!result.ok) setError(result.message)
      } catch (thrown) {
        // requireUserId() inside the action redirects to /login on an
        // expired session, which rejects the same way a navigation does.
        unstable_rethrow(thrown)
        setError(FALLBACK_ERROR_MESSAGE)
      }
    })
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-5">
      <p className="text-sm">
        The slots for week {weekIndex} are laid out, but their full briefs -- hook, key points, proof and
        call to action -- have not been written yet.
      </p>
      {isPending && (
        <p className="mt-3 flex items-center gap-2 text-sm text-text-muted" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Writing this week&rsquo;s briefs -- up to a minute.
        </p>
      )}
      {error && !isPending && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4">
        <Button type="button" onClick={handleClick} disabled={isPending}>
          {isPending ? 'Writing…' : error ? 'Try again' : `Write week ${weekIndex}'s briefs`}
        </Button>
      </div>
    </div>
  )
}
