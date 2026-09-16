'use server'

import { redirect } from 'next/navigation'
import { parseVoiceFormValues, type VoiceFormValues } from '@/lib/onboarding/voice-edit'
import { nextStep, routeForStep } from '@/lib/onboarding/steps'
import { createServerClient } from '@/lib/supabase/server'
import { updateProfile } from '@/server/db/repositories/profiles'
import { updateVoiceProfile } from '@/server/db/repositories/voice-profiles'

/**
 * The Voice Profile editor (Task 9, spec §4.1).
 *
 * Both exports re-derive the signed-in user from the session
 * (`supabase.auth.getUser()`) rather than trusting a userId the client
 * sent -- Prisma bypasses RLS, so that would be a cross-customer data hole,
 * not a bug (CLAUDE.md).
 */

export type VoiceActionResult = { ok: true } | { ok: false; message: string }

/**
 * `Error.message`/`.name` are non-enumerable, so logging the error object
 * itself serialises to `{}` -- same reasoning as
 * `src/app/(app)/onboarding/samples/actions.ts`.
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
 * Validates the submitted form and persists it. Shared by `saveVoice` (stay
 * on screen) and `continueFromVoice` (save, then advance) -- from this
 * point on the two are the same write, so there is exactly one place that
 * calls `updateVoiceProfile`.
 *
 * `updateVoiceProfile` always sets `user_edited = true`, whether or not
 * anything actually changed from the derived values: reaching Continue
 * from this screen *is* the user's review, per spec §4.1 -- confirming the
 * machine's guess is still a human decision, not a no-op.
 */
async function saveEdit(userId: string, values: VoiceFormValues): Promise<VoiceActionResult> {
  const parsed = parseVoiceFormValues(values)
  if (!parsed.success) {
    // Not reachable from the editor's own UI, which only ever submits a
    // value it rendered from one of the `*_OPTIONS` catalogues -- this is
    // the safety net CLAUDE.md asks for, not an expected path.
    return { ok: false, message: parsed.message }
  }

  try {
    await updateVoiceProfile(userId, parsed.edit)
  } catch (error) {
    console.error(
      `LinkBud: saveEdit failed to update the voice profile for user ${userId} - ${describeErrorForLog(error)}`,
    )
    return {
      ok: false,
      message: 'Something went wrong saving your changes. Try again.',
    }
  }

  return { ok: true }
}

/** The "Save changes" action: persists the edit and stays on this screen. */
export async function saveVoice(values: VoiceFormValues): Promise<VoiceActionResult> {
  const userId = await requireUserId()
  return saveEdit(userId, values)
}

/**
 * The "Continue" action: saves whatever is currently on screen -- so a user
 * who edits a field and goes straight to Continue, without a separate Save
 * click, never loses it -- then advances onboarding.
 *
 * Controller ruling R11 overrides the task brief's Step 2, which said to
 * set `onboarding_step` to the literal `'done'`. This sets it via
 * `nextStep('voice')`, which yields `'strategy'`: the spec's own state
 * machine lists `strategy` and `paywall` as real onboarding steps, and
 * marking a user `'done'` before a strategy exists would contradict it --
 * and would silently skip every current user past the `strategy` step the
 * day Milestone 3 ships it. `routeForStep('strategy')` already resolves to
 * `/dashboard` (Ruling R3), and `onboardingRouteFor('strategy')` is `null`,
 * so these users reach the dashboard unimpeded in the meantime.
 */
export async function continueFromVoice(values: VoiceFormValues): Promise<VoiceActionResult> {
  const userId = await requireUserId()

  const saved = await saveEdit(userId, values)
  if (!saved.ok) return saved

  try {
    await updateProfile(userId, { onboardingStep: nextStep('voice') })
  } catch (error) {
    console.error(
      `LinkBud: continueFromVoice failed to advance onboarding for user ${userId} - ${describeErrorForLog(error)}`,
    )
    return {
      ok: false,
      message: 'Your changes were saved, but advancing failed. Try again.',
    }
  }

  redirect(routeForStep(nextStep('voice')))
}
