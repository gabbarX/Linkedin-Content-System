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
  await upsertBusinessProfile(user.id, businessProfile)
  await updateProfile(user.id, {
    cadencePerWeek: profile.cadencePerWeek,
    preferredPostTime: profile.preferredPostTime,
    timezone: profile.timezone,
    onboardingStep: nextStep('interview'),
  })
  await clearInterviewDraft(user.id)

  redirect(routeForStep(nextStep('interview')))
}
