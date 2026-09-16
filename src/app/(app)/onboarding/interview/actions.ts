'use server'

import { redirect } from 'next/navigation'
import {
  applyDraftAnswer,
  normalizeAnswerValue,
  splitAnswersForPersistence,
  validateDraft,
} from '@/lib/onboarding/interview-draft'
import { INTERVIEW_QUESTIONS, questionAt } from '@/lib/onboarding/questions'
import { nextStep, routeForStep } from '@/lib/onboarding/steps'
import { createServerClient } from '@/lib/supabase/server'
import { upsertBusinessProfile } from '@/server/db/repositories/business-profiles'
import {
  clearInterviewDraft,
  getInterviewDraft,
  saveInterviewDraft,
  updateProfile,
} from '@/server/db/repositories/profiles'

export type SaveAnswerResult = {
  ok: false
  message: string
}

/**
 * `Error.message`/`.name` are non-enumerable, so logging the error object
 * itself serialises to `{}` -- same reasoning as
 * `src/app/(app)/onboarding/samples/actions.ts` and
 * `src/app/(app)/onboarding/voice/actions.ts`.
 */
function describeErrorForLog(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/**
 * Advances the interview by one question.
 *
 * Takes a question id, not an index or a user id: the id is looked up
 * against `INTERVIEW_QUESTIONS` here, server-side, so the wizard's own
 * position in the URL is never trusted for anything beyond "which screen to
 * render" — and the user is re-derived from the session on every call
 * (`supabase.auth.getUser()`), never taken as a client-supplied argument,
 * per CLAUDE.md's authorization model.
 *
 * On every non-final advance this only ever touches `profiles.interview_draft`
 * — the whole point of that column is that closing the tab costs nothing.
 * On the final advance it validates the complete draft, and only then writes
 * `business_profiles` and the profile's cadence/time/timezone/onboarding_step,
 * and clears the draft. A validation failure at that point returns a result
 * instead of redirecting, and the caller (the client wizard) is responsible
 * for sending the user back to whichever question actually failed — see
 * `validateDraft`'s `firstInvalidIndex`.
 */
export async function saveAnswer(
  questionId: string,
  rawValue: string | string[],
): Promise<SaveAnswerResult> {
  const index = INTERVIEW_QUESTIONS.findIndex((q) => q.id === questionId)
  const question = questionAt(index)
  if (!question) {
    // Not reachable from the wizard's own UI, which only ever submits ids it
    // rendered from INTERVIEW_QUESTIONS. Treated as "start over" rather than
    // thrown, since there is nothing sensible to recover to otherwise.
    redirect('/onboarding/interview')
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const value = normalizeAnswerValue(question, rawValue)

  if (question.required && value === undefined) {
    return { ok: false, message: 'This one needs an answer before you can continue.' }
  }

  const draft = (await getInterviewDraft(user.id)) ?? {}
  const isLast = index === INTERVIEW_QUESTIONS.length - 1
  const nextIndex = Math.min(index + 1, INTERVIEW_QUESTIONS.length - 1)
  const updatedDraft = applyDraftAnswer(draft, question.field, value, nextIndex)

  if (!isLast) {
    await saveInterviewDraft(user.id, updatedDraft)
    redirect(`/onboarding/interview?q=${nextIndex}`)
  }

  // Final advance: validate the whole draft before anything real is written.
  const validation = validateDraft(updatedDraft)
  if (!validation.success) {
    // Keep the draft (including whatever just got typed) so the user does
    // not lose the answer they just gave, then send them to whichever
    // question is actually wrong.
    await saveInterviewDraft(user.id, updatedDraft)
    redirect(`/onboarding/interview?q=${validation.firstInvalidIndex}&invalid=1`)
  }

  const { businessProfile, profile } = splitAnswersForPersistence(validation.answers)

  // I4: this whole block -- the final advance's writes -- is one try/catch,
  // matching samples/actions.ts and voice/actions.ts. This is the most
  // consequential write in the flow, and it was previously the only one on
  // any onboarding screen with no error handling at all: a transient
  // database error here used to replace the whole page with the nearest
  // error boundary instead of an inline retry.
  //
  // `saveInterviewDraft` runs FIRST, before `upsertBusinessProfile`, so the
  // just-typed final answer (already merged into `updatedDraft` above)
  // survives a failure in the writes that follow -- previously the success
  // path never persisted the draft at all, so a failure here would have
  // lost it. `redirect()` stays outside the try -- it works by throwing a
  // Next.js navigation signal, and catching that here would break the
  // redirect instead of an error (same reasoning as
  // samples/actions.ts's `deriveAndAdvance`).
  try {
    await saveInterviewDraft(user.id, updatedDraft)
    await upsertBusinessProfile(user.id, businessProfile)
    await updateProfile(user.id, {
      cadencePerWeek: profile.cadencePerWeek,
      preferredPostTime: profile.preferredPostTime,
      timezone: profile.timezone,
      onboardingStep: nextStep('interview'),
    })
    await clearInterviewDraft(user.id)
  } catch (error) {
    console.error(
      `LinkBud: saveAnswer failed to persist the finished interview for user ${user.id} - ${describeErrorForLog(error)}`,
    )
    return {
      ok: false,
      message: 'Something went wrong saving your answers. Nothing was lost -- try again.',
    }
  }

  redirect(routeForStep(nextStep('interview')))
}
