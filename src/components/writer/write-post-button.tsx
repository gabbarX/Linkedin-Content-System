'use client'

import { Loader2 } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

/**
 * The tap that spends four model calls.
 *
 * Generation is never automatic (Ruling R-M5-3 / the generation question):
 * opening a slot shows its brief and this button, and nothing is generated
 * until the user asks. Browsing the calendar therefore cannot bill us, which
 * matters on a free provider tier measured in requests per day.
 *
 * Same shape as `BriefWeekButton`: `useTransition`, `unstable_rethrow` before
 * the fallback message, `role="status"` on pending and `role="alert"` on
 * error, and a label that cycles idle → pending → "Try again".
 */

type ActionResult = { ok: true } | { ok: false; message: string }

const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Nothing was saved -- try again in a moment.'

export type WritePostButtonProps = {
  slotId: string
  writePost: (slotId: string) => Promise<ActionResult>
}

export function WritePostButton({ slotId, writePost }: WritePostButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await writePost(slotId)
        if (!result.ok) setError(result.message)
      } catch (thrown) {
        unstable_rethrow(thrown)
        setError(FALLBACK_ERROR_MESSAGE)
      }
    })
  }

  return (
    <div>
      {isPending && (
        <p className="mb-3 flex items-center gap-2 text-sm text-text-muted" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Writing three drafts — this takes up to a minute.
        </p>
      )}
      {error && !isPending && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="button" onClick={handleClick} disabled={isPending}>
        {isPending ? 'Writing…' : error ? 'Try again' : 'Write three drafts'}
      </Button>
    </div>
  )
}
