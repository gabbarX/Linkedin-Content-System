'use client'

import { Loader2 } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Structurally identical to `StrategyActionResult` in
 * `src/server/strategy/actions.ts` -- declared locally so this component
 * does not reach into a server module for a type (same pattern as
 * `sample-list.tsx`). A success redirects server-side before the promise
 * resolves with a value, so `ok: true` is never actually observed here.
 */
type StrategyActionResult = { ok: true } | { ok: false; message: string }

const FALLBACK_ERROR_MESSAGE =
  'Something went wrong. Nothing you entered is lost -- try again in a moment.'

export type StrategyBuilderProps = {
  /** 3, 4 or 5 -- from the profile, so the copy is specific. */
  cadence: number
  /** Pre-formatted server-side, e.g. "Monday 21 Sep 2026", so the two
   * renders can never disagree on the date. */
  startsOnLabel: string
  buildStrategy: () => Promise<StrategyActionResult>
  /**
   * `onboarding` is the first build, framed as the last step before the
   * product. `empty` is the `/strategy` page for a user past onboarding
   * with no strategy row -- a state no normal path produces, so it is
   * framed as "build one" without onboarding language.
   */
  variant: 'onboarding' | 'empty'
}

/**
 * The one-tap strategy build (Task 6, spec §4.2). One screen: what will be
 * generated, specific to this user, then a single button.
 *
 * Generation is five model calls plus one for the week's briefs -- measured
 * at 30-60 s when the default provider is healthy and longer when it falls
 * back (see `src/server/strategy/complete-with-fallback.ts`), so the pending
 * state says so honestly and the button is disabled for the duration.
 *
 * The action call is wrapped in try/catch as a second line of defence: the
 * action itself catches everything it can and returns a typed failure, but
 * an unexpected rejection still has to land the user somewhere with a next
 * action instead of a transition that never resolves.
 */
export function StrategyBuilder({ cadence, startsOnLabel, buildStrategy, variant }: StrategyBuilderProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const slotCount = cadence * 12

  function handleBuild() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await buildStrategy()
        if (!result.ok) setError(result.message)
      } catch (thrown) {
        // A redirect is not a failure -- it is how a successful build
        // reports success in the App Router. Re-throwing lets the
        // framework's RedirectBoundary navigate; only a genuine failure
        // reaches the message below.
        unstable_rethrow(thrown)
        setError(FALLBACK_ERROR_MESSAGE)
      }
    })
  }

  return (
    <div className="py-10">
      <h1 className="font-display text-3xl">
        {variant === 'onboarding' ? 'Last step: your 12-week strategy' : 'Build your 12-week strategy'}
      </h1>
      <p className="mt-2 text-text-muted">
        {variant === 'onboarding'
          ? 'Everything you told us -- your offer, who it is for, how you write -- becomes a plan you can see before you decide anything else.'
          : 'There is no strategy on your account yet. Build one from your business and voice profiles.'}
      </p>

      <div className="mt-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="font-display text-xl">What you will get</h2>
        <ul className="mt-4 flex flex-col gap-3 text-sm">
          <li className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            <span>
              <strong className="font-medium">Four or five content pillars</strong> -- the themes every post
              proves something about, each one pointing at your offer.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            <span>
              <strong className="font-medium">A twelve-week arc</strong> -- authority, then problem-aware, then
              offer-aware, then invitation. Readers are earned before they are asked.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            <span>
              <strong className="font-medium">{slotCount} dated slots</strong> -- {cadence} a week, starting{' '}
              {startsOnLabel}, each with a theme, an angle, a format and a one-line brief.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            <span>
              <strong className="font-medium">The first week briefed in full</strong> -- hook, key points, proof
              and call to action for each post. Later weeks stay open, so what you learn can steer them.
            </span>
          </li>
        </ul>
      </div>

      {isPending && (
        <p className="mt-6 flex items-center gap-2 text-sm text-text-muted" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Planning your twelve weeks. This usually takes about a minute, sometimes two -- stay on this
          page.
        </p>
      )}

      {error && !isPending && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 flex justify-end">
        <Button type="button" onClick={handleBuild} disabled={isPending}>
          {isPending ? 'Planning…' : error ? 'Try again' : 'Build my strategy'}
        </Button>
      </div>
    </div>
  )
}
