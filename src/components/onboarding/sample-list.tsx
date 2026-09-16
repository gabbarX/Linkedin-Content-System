'use client'

import { Loader2 } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  SAMPLES_RULE_MESSAGE,
  WRITTEN_MIN,
  countBySource,
  samplesSatisfyRule,
  splitPastedText,
  type SampleEntryInput,
  type SampleSourceInput,
} from '@/lib/onboarding/samples'

/**
 * Structurally identical to the `SavedSummary`/`SamplesActionResult` types in
 * `src/app/(app)/onboarding/samples/actions.ts` -- declared locally so this
 * component does not reach into an app route's internals for a type (same
 * pattern as `QuestionCard`'s local `SaveAnswerResult`). A success redirects
 * server-side before the promise resolves with a value, so `ok: true` is
 * never actually observed here.
 */
type SavedSummary = { total: number; pasted: number; written: number }
type SamplesActionResult =
  | { ok: true }
  | { ok: false; stage: 'validation'; message: string }
  | { ok: false; stage: 'derivation'; message: string; saved: SavedSummary }

const FALLBACK_ERROR_MESSAGE =
  'Something went wrong. Your samples are safe -- try again in a moment.'

export type ExistingSample = {
  id: string
  source: SampleSourceInput
}

type SampleListProps = {
  /** Samples already saved for this account, fetched server-side. Non-empty
   * only when a previous derivation attempt failed after the samples were
   * saved -- see the ordering guarantee in actions.ts. Used solely to pick
   * this component's *initial* screen on mount (retry vs. paste): once
   * mounted, `mode` is owned by this component's own state, set directly
   * from a server action's result rather than re-derived from this prop --
   * a client component's state does not reset just because a prop changes
   * on a `router.refresh()`. */
  initialSamples: ExistingSample[]
  submitSamples: (entries: SampleEntryInput[]) => Promise<SamplesActionResult>
  retryDerivation: () => Promise<SamplesActionResult>
  startOver: () => Promise<void>
}

/**
 * The writing-samples step (Task 8). Two screens in one component, switched
 * on `mode`:
 *
 *   * **Paste form** -- nothing saved yet. Bulk-paste box (split on a `---`
 *     line into individual posts) plus two "write fresh" boxes, validated
 *     live against the shared 5-10/2-written rule before the user ever
 *     submits.
 *   * **Retry screen** -- samples are saved server-side. Reached either
 *     immediately after a failed submission (this component switches
 *     itself, synchronously, the moment the server reports a
 *     derivation-stage failure, using the `saved` counts *it* read from the
 *     database -- never this component's own guess at what was typed) or by
 *     loading this page fresh once samples already exist (`initialSamples`
 *     non-empty). Offers "derive" (first attempt or retry -- the server
 *     runs the identical operation either way) and "start over" (deletes
 *     every saved sample so the user can paste something different).
 *
 * The model call is 8-12 seconds (measured, see `src/server/llm/client.ts`),
 * so every action that can trigger one runs inside `useTransition` and
 * renders a real pending message rather than a button that looks dead.
 *
 * Every server action call below is wrapped in try/catch. The actions
 * themselves catch everything they can and return a typed failure, so this
 * is a second line of defence -- an unexpected rejection (a framework-level
 * error, a bug) still has to land the user somewhere with a next action
 * instead of a transition that never resolves.
 */
export function SampleList({
  initialSamples,
  submitSamples,
  retryDerivation,
  startOver,
}: SampleListProps) {
  const [mode, setMode] = useState<'paste' | 'retry'>(
    initialSamples.length > 0 ? 'retry' : 'paste',
  )
  const [savedCounts, setSavedCounts] = useState(() => countBySource(initialSamples))
  const [savedTotal, setSavedTotal] = useState(initialSamples.length)
  const [pastedText, setPastedText] = useState('')
  const [writtenA, setWrittenA] = useState('')
  const [writtenB, setWrittenB] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [derivationError, setDerivationError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const entries = useMemo<SampleEntryInput[]>(() => {
    const pastedSamples = splitPastedText(pastedText).map((content) => ({
      content,
      source: 'pasted' as const,
    }))
    const writtenSamples = [writtenA, writtenB]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((content) => ({ content, source: 'written' as const }))
    return [...pastedSamples, ...writtenSamples]
  }, [pastedText, writtenA, writtenB])

  const counts = countBySource(entries)
  const isValid = samplesSatisfyRule(entries)

  function applyDerivationFailure(saved: SavedSummary, message: string) {
    setSavedCounts({ pasted: saved.pasted, written: saved.written })
    setSavedTotal(saved.total)
    setMode('retry')
    setDerivationError(message)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!isValid) {
      setValidationError(SAMPLES_RULE_MESSAGE)
      return
    }
    setValidationError(null)
    setDerivationError(null)
    startTransition(async () => {
      try {
        const result = await submitSamples(entries)
        if (!result.ok) {
          if (result.stage === 'derivation') {
            applyDerivationFailure(result.saved, result.message)
          } else {
            setValidationError(result.message)
          }
        }
      } catch (error) {
        // A redirect (or notFound) is not a failure -- it is how a Server
        // Action reaching redirect() reports success in the App Router:
        // Next rejects the call with its own digest-tagged error so the
        // framework's RedirectBoundary can catch it and navigate. Every
        // successful submitSamples call ends in exactly this rejection.
        // Re-throwing it lets that boundary do its job; only a genuine
        // failure falls through to the message below.
        unstable_rethrow(error)
        setValidationError(FALLBACK_ERROR_MESSAGE)
      }
    })
  }

  function handleRetry() {
    setDerivationError(null)
    startTransition(async () => {
      try {
        const result = await retryDerivation()
        if (!result.ok) {
          if (result.stage === 'derivation') {
            applyDerivationFailure(result.saved, result.message)
          } else {
            setDerivationError(result.message)
          }
        }
      } catch (error) {
        // Same reasoning as handleSubmit: retryDerivation redirects on
        // success, which rejects with Next's own redirect error. That must
        // reach the framework's boundary, not this component's fallback.
        unstable_rethrow(error)
        setDerivationError(FALLBACK_ERROR_MESSAGE)
      }
    })
  }

  function handleStartOver() {
    setDerivationError(null)
    startTransition(async () => {
      try {
        await startOver()
        setMode('paste')
        setSavedCounts({ pasted: 0, written: 0 })
        setSavedTotal(0)
        setPastedText('')
        setWrittenA('')
        setWrittenB('')
      } catch (error) {
        // startOver has no success-path redirect of its own, but
        // requireUserId() inside it redirects to /login on an expired
        // session, which rejects the same way -- so every catch here gets
        // the identical treatment rather than leaving one call site as an
        // unexplained exception to the other two.
        unstable_rethrow(error)
        // Deletion failed -- stay on the retry screen with an honest message
        // rather than silently pretending the samples are gone.
        setDerivationError('Could not clear your saved samples. Try again.')
      }
    })
  }

  if (mode === 'retry') {
    return (
      <div className="py-10">
        <h1 className="font-display text-3xl">Ready to learn your voice</h1>
        <p className="mt-2 text-[var(--color-text-muted)]">
          {savedTotal} sample{savedTotal === 1 ? '' : 's'} saved --{' '}
          {savedCounts.pasted} pasted, {savedCounts.written} written from scratch. Nothing you
          pasted was lost.
        </p>

        {isPending && (
          <p className="mt-6 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Analysing your writing style -- this can take up to ten seconds.
          </p>
        )}

        {derivationError && !isPending && (
          <p role="alert" className="mt-6 text-sm text-danger">
            {derivationError}
          </p>
        )}

        <div className="mt-8 flex items-center gap-3">
          <Button type="button" onClick={handleRetry} disabled={isPending}>
            {isPending ? 'Analysing…' : derivationError ? 'Try again' : 'Derive my voice profile'}
          </Button>
          <Button type="button" variant="outline" onClick={handleStartOver} disabled={isPending}>
            Start over
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="py-10">
      <h1 className="font-display text-3xl">Show us how you write</h1>
      <p className="mt-2 text-[var(--color-text-muted)]">{SAMPLES_RULE_MESSAGE}</p>

      <div className="mt-8 rounded-lg border border-border bg-surface p-6">
        <Label htmlFor="pasted-samples" className="text-base font-medium">
          Paste your own past posts
        </Label>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Paste as many as you like below. Put a line with just{' '}
          <code className="rounded-sm bg-bg px-1 py-0.5 text-[var(--color-text)]">---</code>{' '}
          between each post.
        </p>
        <Textarea
          id="pasted-samples"
          value={pastedText}
          onChange={(event) => setPastedText(event.target.value)}
          rows={10}
          placeholder={'First post here.\n---\nSecond post here.'}
          className="mt-4"
        />
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          {counts.pasted} post{counts.pasted === 1 ? '' : 's'} detected.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <Label className="text-base font-medium">
          Or write {WRITTEN_MIN} new posts from scratch
        </Label>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Never posted before? Write {WRITTEN_MIN} short posts the way you actually talk instead.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <Label htmlFor="written-a" className="sr-only">
              New post 1
            </Label>
            <Textarea
              id="written-a"
              value={writtenA}
              onChange={(event) => setWrittenA(event.target.value)}
              rows={4}
              placeholder="New post 1"
            />
          </div>
          <div>
            <Label htmlFor="written-b" className="sr-only">
              New post 2
            </Label>
            <Textarea
              id="written-b"
              value={writtenB}
              onChange={(event) => setWrittenB(event.target.value)}
              rows={4}
              placeholder="New post 2"
            />
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-[var(--color-text-muted)]">
        {isValid
          ? 'Ready to continue.'
          : `${SAMPLES_RULE_MESSAGE} (${counts.pasted} pasted, ${counts.written} written so far.)`}
      </p>

      {validationError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {validationError}
        </p>
      )}

      {isPending && (
        <p className="mt-4 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Analysing your writing style -- this can take up to ten seconds.
        </p>
      )}

      <div className="mt-8 flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Analysing…' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
