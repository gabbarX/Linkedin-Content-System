'use server'

import { redirect } from 'next/navigation'
import {
  countBySource,
  samplesSubmissionSchema,
  type SampleEntryInput,
  type SampleSourceInput,
} from '@/lib/onboarding/samples'
import { nextStep, routeForStep } from '@/lib/onboarding/steps'
import { createServerClient } from '@/lib/supabase/server'
import { updateProfile } from '@/server/db/repositories/profiles'
import {
  saveDerivedVoiceProfile,
  type DerivedVoiceProfile,
} from '@/server/db/repositories/voice-profiles'
import {
  addWritingSamples,
  countWritingSamples,
  deleteAllWritingSamples,
  listWritingSamples,
  type NewWritingSample,
} from '@/server/db/repositories/writing-samples'
import { describeDerivationError } from '@/server/onboarding/describe-derivation-error'
import { deriveVoiceProfile } from '@/server/onboarding/derive-voice'
import { measureSample } from '@/server/onboarding/measure-samples'

/**
 * The writing-samples step (spec §4.1, Task 8).
 *
 * Every exported function re-derives the signed-in user from the session
 * (`supabase.auth.getUser()`) rather than trusting anything the client sent
 * -- Prisma bypasses RLS, so a userId taken as an argument would be a
 * cross-customer data hole, not a bug (CLAUDE.md).
 *
 * **Order matters.** `submitSamples` writes the samples with
 * `addWritingSamples` BEFORE it ever calls `deriveVoiceProfile`. A failed
 * derivation (missing key, rate limit, a malformed reply) must never cost
 * the user the text they just pasted -- that is the single worst outcome
 * this screen could produce, and the ordering below is what prevents it. By
 * the time derivation is attempted, the samples are already durable, so
 * `retryDerivation` can re-run the model call with nothing more than the
 * user's session -- no re-paste required.
 *
 * **Every step in both operations is guarded**, not just the model call.
 * A transient Prisma error while counting, inserting, saving the derived
 * profile, or advancing the step is exactly as recoverable as a model
 * failure from the user's point of view -- neither should be able to reject
 * this action into an uncaught rejection, which (per Next's App Router)
 * surfaces as a spinner that never resolves on the client and, if nothing
 * catches it, the nearest error boundary. `describeDerivationError` still
 * distinguishes an `LlmError` (model-specific: missing key, rate limit) from
 * everything else, because those two have a different actionable message --
 * but no code path here rejects into nothing.
 */

/** What the client needs to render the retry screen honestly: the *actual*
 * saved state, read from the database, never the client's own guess at what
 * it just typed. */
export type SavedSummary = { total: number; pasted: number; written: number }

export type SamplesActionResult =
  | { ok: true }
  | { ok: false; stage: 'validation'; message: string }
  | { ok: false; stage: 'derivation'; message: string; saved: SavedSummary }

function summarizeSaved(samples: readonly { source: SampleSourceInput }[]): SavedSummary {
  return { total: samples.length, ...countBySource(samples) }
}

/**
 * `Error.message`/`.name` are non-enumerable, so logging the error object
 * itself (or a literal built from it) serialises to `{}` in the server log
 * -- the same reasoning `src/app/auth/callback/route.ts` already documents.
 * Used to log the real cause of a caught failure server-side: the
 * user-facing message stays generic and recoverable on purpose, but a
 * genuine programming bug must leave a trace *somewhere*, or it is strictly
 * worse than the crash it replaced.
 */
function describeErrorForLog(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function requireUserId(): Promise<string> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return user.id
}

/**
 * Derive from whatever is already saved, save the result, advance the step,
 * and only then redirect. Shared by the first submission and every retry --
 * from this point on the two are the same operation, because the samples
 * are already durable either way.
 *
 * The whole operation -- reading the saved samples, calling the model,
 * persisting the result, advancing the step -- is one try/catch. Guarding
 * only the model call was the gap a review caught: a Prisma error from any
 * of the surrounding writes is no more the user's fault than a rate limit
 * is, and deserves the same "samples are safe, here is a next action"
 * response rather than an uncaught rejection. `redirect()` is deliberately
 * outside the try -- it works by throwing a Next.js navigation signal, and
 * catching that here would break the redirect instead of an error.
 */
async function deriveAndAdvance(userId: string): Promise<SamplesActionResult> {
  let saved: SavedSummary = { total: 0, pasted: 0, written: 0 }

  try {
    const samples = await listWritingSamples(userId)
    saved = summarizeSaved(samples)

    const derived: DerivedVoiceProfile = await deriveVoiceProfile(
      samples.map((sample) => sample.content),
    )
    await saveDerivedVoiceProfile(userId, derived)
    await updateProfile(userId, { onboardingStep: nextStep('samples') })
  } catch (error) {
    console.error(
      `LinkBud: deriveAndAdvance failed for user ${userId} - ${describeErrorForLog(error)}`,
    )
    return { ok: false, stage: 'derivation', message: describeDerivationError(error), saved }
  }

  redirect(routeForStep(nextStep('samples')))
}

/**
 * First submission of this step. Validated against the exact same
 * `samplesSubmissionSchema` the client checks inline, so the two can never
 * disagree about whether five pasted posts is enough.
 *
 * If this account already has saved samples -- a stale client after a
 * reload, a back-forward-cached form, two tabs racing a submit -- the newly
 * typed entries are never written a second time. Instead of returning an
 * error message with no matching action (the earlier version of this
 * function did, and a review caught it: the message said "retry deriving"
 * but the paste form has no retry control), this routes straight into
 * `deriveAndAdvance`, exactly what `retryDerivation` would do. Either it
 * succeeds and the user moves on, or it fails and lands them on the retry
 * screen with a message and a button that agree with each other.
 */
export async function submitSamples(entries: SampleEntryInput[]): Promise<SamplesActionResult> {
  const userId = await requireUserId()

  const parsed = samplesSubmissionSchema.safeParse({ samples: entries })
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'These samples are not valid yet.'
    return { ok: false, stage: 'validation', message }
  }

  try {
    const existing = await countWritingSamples(userId)
    if (existing === 0) {
      const newSamples: NewWritingSample[] = parsed.data.samples.map((sample) => ({
        content: sample.content,
        source: sample.source,
        ...measureSample(sample.content),
      }))
      await addWritingSamples(userId, newSamples)
    }
  } catch (error) {
    console.error(
      `LinkBud: submitSamples failed to save samples for user ${userId} - ${describeErrorForLog(error)}`,
    )
    // Nothing durable happened in this branch -- the count or the insert
    // itself failed, not anything downstream of a successful save. Stay on
    // the paste form: the user's typed text is still in it, and there is
    // nothing to retry deriving from yet.
    return {
      ok: false,
      stage: 'validation',
      message: 'Something went wrong saving your samples. Nothing was saved -- try again.',
    }
  }

  return deriveAndAdvance(userId)
}

/**
 * The recovery path after a failed derivation. Takes no arguments: every
 * sample it needs is already in `writing_samples`, saved by `submitSamples`
 * before the model was ever called.
 */
export async function retryDerivation(): Promise<SamplesActionResult> {
  const userId = await requireUserId()
  return deriveAndAdvance(userId)
}

/**
 * Deletes every saved sample so the user can start over with a blank paste
 * form, rather than being stuck retrying a derivation indefinitely.
 */
export async function startOver(): Promise<void> {
  const userId = await requireUserId()
  await deleteAllWritingSamples(userId)
}
