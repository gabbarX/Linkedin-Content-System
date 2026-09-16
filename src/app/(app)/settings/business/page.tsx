import { redirect } from 'next/navigation'
import { BusinessProfileForm } from '@/components/settings/business-profile-form'
import { businessProfileToFormValues } from '@/lib/onboarding/business-profile-edit'
import { createServerClient } from '@/lib/supabase/server'
import { getBusinessProfile } from '@/server/db/repositories/business-profiles'
import { saveBusinessProfile } from './actions'

/**
 * The Business Profile settings page (Task 10, spec §4.1 / Ruling R5).
 *
 * One page, every field, not a wizard: the interview asks these questions
 * one at a time because a first-time answer benefits from focus; this page
 * is a review, where seeing everything at once is what lets the user spot
 * what has gone stale. Both consume the exact same field definitions from
 * `INTERVIEW_QUESTIONS` via `BUSINESS_PROFILE_QUESTIONS` -- see
 * `src/lib/onboarding/business-profile-edit.ts`.
 *
 * A user who has not finished the interview has no `business_profiles` row
 * yet. This page does not redirect them to the interview or block the
 * form: it renders every field blank, and saving creates the row --
 * `upsertBusinessProfile`'s own doc comment says as much ("the same form
 * serves onboarding and the later settings editor"). Sending them
 * elsewhere would contradict that design and would make a page linked from
 * `/settings` 404-adjacent (unusable) for anyone who typed the URL before
 * finishing onboarding, for no real benefit -- there is nothing unsafe
 * about drafting a business profile early.
 *
 * Deliberately does NOT edit `cadencePerWeek`, `preferredPostTime` or
 * `timezone` -- those three interview answers persist to `profiles`, not
 * `business_profiles` (`FIELD_COLUMNS`), and the interfaces this task was
 * scoped against (`BusinessProfileInput`, `upsertBusinessProfile`) only
 * ever touch the business-profile columns. This page is the business
 * profile editor; posting cadence and schedule are a different settings
 * concern, for whichever page ends up owning "how LinkBud runs", not "what
 * LinkBud says about you".
 */
export default async function BusinessProfileSettingsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // (app)/layout.tsx already redirects an unauthenticated request; this is
  // the same defensive re-check every onboarding page makes, and this page
  // needs user.id regardless to load the profile.
  if (!user) redirect('/login')

  const profile = await getBusinessProfile(user.id)

  return (
    <div className="py-10">
      <h1 className="font-display text-3xl">Business profile</h1>
      <p className="mt-2 text-[var(--color-text-muted)]">
        {profile
          ? 'The offer, audience and voice inputs every draft is built from. Update anything that has changed.'
          : "You haven't finished the interview yet, so this is blank. Fill it in and save whenever you're ready -- or finish the guided interview instead."}
      </p>

      <div className="mt-8">
        <BusinessProfileForm
          initial={businessProfileToFormValues(profile)}
          saveBusinessProfile={saveBusinessProfile}
        />
      </div>
    </div>
  )
}
