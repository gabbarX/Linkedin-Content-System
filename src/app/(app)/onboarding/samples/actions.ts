'use server'

import { redirect } from 'next/navigation'
import { samplesSubmissionSchema, type SampleEntryInput } from '@/lib/onboarding/samples'
import { nextStep, routeForStep } from '@/lib/onboarding/steps'
import { createServerClient } from '@/lib/supabase/server'
import {
  updateProfile,
} from '@/server/db/repositories/profiles'
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
import { LlmError } from '@/server/llm/client'
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
 */

export type SamplesActionResult =
  | { ok: true }
  | { ok: false; stage: 'validation'; message: string }
  | { ok: false; stage: 'derivation'; message: string }

/**
 * Turn a caught model-call failure into something the user can act on. A
 * missing key and a rate limit are different problems with different
 * responses (task brief): one needs a fix on our side and retrying will not
 * help, the other resolves itself shortly. Everything else -- an unknown
 * model, a malformed reply, a dropped connection -- collapses into one
 * generic, still-recoverable message, because there is nothing more
 * specific the user could act on for any of them.
 */
function describeDerivationError(error: unknown): string {
  if (!(error instanceof LlmError)) {
    return 'Something went wrong analysing your samples. Your samples are saved -- try again in a moment.'
  }
  if (error.message.includes('OPENROUTER_API_KEY is not set')) {
    return 'The AI model is not configured yet, so retrying will not help until that is fixed on our side. Your samples are saved and nothing is lost.'
  }
  if (/OpenRouter returned 429/.test(error.message)) {
    return 'The AI model is rate-limited right now. Your samples are saved -- wait a minute and try again.'
  }
  return 'The AI model returned an unexpected response. Your samples are saved -- try again in a moment.'
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
 */
async function deriveAndAdvance(userId: string): Promise<SamplesActionResult> {
  const samples = await listWritingSamples(userId)

  let derived: DerivedVoiceProfile
  try {
    derived = await deriveVoiceProfile(samples.map((sample) => sample.content))
  } catch (error) {
    return { ok: false, stage: 'derivation', message: describeDerivationError(error) }
  }

  await saveDerivedVoiceProfile(userId, derived)
  await updateProfile(userId, { onboardingStep: nextStep('samples') })
  redirect(routeForStep(nextStep('samples')))
}

/**
 * First submission of this step. Validated against the exact same
 * `samplesSubmissionSchema` the client checks inline, so the two can never
 * disagree about whether five pasted posts is enough.
 *
 * Refuses to run twice: if this account already has saved samples (a stale
 * client after a reload, a double submit racing a slow first request), it
 * returns a validation-stage message instead of appending a second batch --
 * `retryDerivation` is the correct call once samples already exist.
 */
export async function submitSamples(entries: SampleEntryInput[]): Promise<SamplesActionResult> {
  const userId = await requireUserId()

  const parsed = samplesSubmissionSchema.safeParse({ samples: entries })
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'These samples are not valid yet.'
    return { ok: false, stage: 'validation', message }
  }

  const existing = await countWritingSamples(userId)
  if (existing > 0) {
    return {
      ok: false,
      stage: 'validation',
      message:
        'Samples are already saved for this account. Retry deriving your voice instead of resubmitting.',
    }
  }

  const newSamples: NewWritingSample[] = parsed.data.samples.map((sample) => ({
    content: sample.content,
    source: sample.source,
    ...measureSample(sample.content),
  }))
  await addWritingSamples(userId, newSamples)

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
