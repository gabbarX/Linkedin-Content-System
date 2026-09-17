import { redirect } from 'next/navigation'
import { StrategyBuilder } from '@/components/strategy/strategy-builder'
import { isPastStep, routeForStep } from '@/lib/onboarding/steps'
import { firstMondayAfter, formatIsoDate, todayInTimeZone } from '@/lib/strategy/schedule'
import { createServerClient } from '@/lib/supabase/server'
import { requireEntitled } from '@/server/billing/entitlement'
import { getBusinessProfile } from '@/server/db/repositories/business-profiles'
import { getProfile } from '@/server/db/repositories/profiles'
import { getVoiceProfile } from '@/server/db/repositories/voice-profiles'
import { buildStrategy } from '@/server/strategy/actions'

/**
 * Ruling R-M3-11: the build is five model calls plus one, measured at
 * 30-60 s on a healthy provider and longer on the fallback. Next applies a
 * page's maxDuration to the Server Actions invoked from it; without this,
 * the platform default cuts the action off mid-generation.
 */
export const maxDuration = 300

/**
 * The strategy step (Task 6, spec §4.2) -- the fourth and, in this
 * milestone, last onboarding step with a page. A user at `strategy` is sent
 * here by the (onboarded) guard; one tap builds the plan and lands them on
 * `/strategy` (Ruling R-M3-6).
 */
export default async function StrategyOnboardingPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // (app)/layout.tsx already redirects an unauthenticated request; this is
  // the same defensive re-check every onboarding page makes.
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  // I1a, as on the other three onboarding pages: a user who has moved past
  // this step must not re-enter it. They have a strategy, so `/strategy` is
  // where they belong. Named explicitly rather than via routeForStep: the
  // step after `strategy` is `done`, whose route is the dashboard, and the
  // plan they just built is the thing worth showing them.
  if (isPastStep(profile.onboardingStep, 'strategy')) redirect('/strategy')

  // Enforcement point 2 of 3 (see src/server/billing/entitlement.ts).
  //
  // This page is a sibling of the `(onboarded)` route group, not a child, so
  // the layout guard never runs for it. Without this line an unpaid user could
  // reach the build button directly, and spec 1.2 (amended 2026-09-17) puts
  // the card before the strategy precisely because that button is six model
  // calls. The server action checks again -- a page guard only constrains a
  // browser that follows redirects.
  await requireEntitled(user.id)

  // The two records a strategy is built from. Missing either means an
  // earlier step did not finish -- send the user to it rather than offer a
  // button that can only fail.
  const [business, voice] = await Promise.all([
    getBusinessProfile(user.id),
    getVoiceProfile(user.id),
  ])
  if (!business) redirect(routeForStep('interview'))
  if (!voice) redirect(routeForStep('samples'))

  const startsOn = firstMondayAfter(todayInTimeZone(profile.timezone))

  return (
    <StrategyBuilder
      variant="onboarding"
      cadence={profile.cadencePerWeek}
      startsOnLabel={formatIsoDate(startsOn, { weekday: true, year: true })}
      buildStrategy={buildStrategy}
    />
  )
}
