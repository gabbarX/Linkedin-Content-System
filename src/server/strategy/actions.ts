'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { nextStep, routeForStep } from '@/lib/onboarding/steps'
import type { StrategyActionResult } from '@/lib/strategy/action-result'
import { todayInTimeZone, upcomingWeekIndex } from '@/lib/strategy/schedule'
import { createServerClient } from '@/lib/supabase/server'
import { getBusinessProfile, type BusinessProfile } from '@/server/db/repositories/business-profiles'
import { getProfile, updateProfile, type Profile } from '@/server/db/repositories/profiles'
import {
  getStrategy,
  replaceStrategy,
  saveSlotBriefs,
  type Strategy,
} from '@/server/db/repositories/strategies'
import { getVoiceProfile, type VoiceProfile } from '@/server/db/repositories/voice-profiles'
import { createFallbackSession, type FallbackSession } from '@/server/llm/complete-with-fallback'
import { describeStrategyError } from './describe-strategy-error'
import { draftWeek } from './draft-week'
import { generateStrategy } from './generate-strategy'

/**
 * The strategy module's server actions (spec §4.2), shared by
 * `/onboarding/strategy` (first build), `/strategy` (regenerate, and the
 * empty state a `paywall`/`done` user with no strategy row would see) and
 * the "write this week's briefs" retry. One file rather than an
 * `actions.ts` beside each page, because the three surfaces run the same
 * two operations and the M2 review pattern -- a boundary applied in one
 * place and forgotten in the next -- is exactly what two copies invite.
 *
 * Every export re-derives the signed-in user from the session rather than
 * trusting anything the client sent -- Prisma bypasses RLS, so a userId
 * argument would be a cross-customer data hole (CLAUDE.md). None of these
 * take arguments at all: everything they need is already the user's own
 * data.
 *
 * **Order matters in `buildStrategy`.** Generation (five model calls) and
 * `replaceStrategy` (one transaction) come first. The onboarding step is
 * advanced the moment the strategy is durable -- BEFORE the coming week is
 * briefed -- because briefing is one more model call that can take a
 * minute, and if the platform cuts the action off inside it the user must
 * be left as a `paywall` user with a plan (next load lands on `/strategy`
 * with the brief button), not as a `strategy` user whose "Try again" spends
 * five more calls replacing a plan that already exists. A brief failure is
 * logged and NOT fatal for the same reason. `redirect()` stays outside every
 * try, because it works by throwing Next's navigation signal.
 */

export type { StrategyActionResult }

/** `Error.message`/`.name` are non-enumerable, so logging the error object
 * itself serialises to `{}` -- same reasoning as the onboarding actions. */
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

type Inputs = { profile: Profile; business: BusinessProfile; voice: VoiceProfile }

/**
 * The three records a strategy is built from. A user missing one is sent to
 * the onboarding step that produces it -- there is nothing to generate from
 * otherwise, and a blank plan would be worse than a redirect.
 */
async function loadInputs(userId: string): Promise<Inputs> {
  const [profile, business, voice] = await Promise.all([
    getProfile(userId),
    getBusinessProfile(userId),
    getVoiceProfile(userId),
  ])
  if (!profile) {
    // (app)/layout.tsx already logs the missing-profile case as the real
    // error; there is no step to route by, so the login page is the only
    // honest destination.
    redirect('/login')
  }
  if (!business) redirect(routeForStep('interview'))
  if (!voice) redirect(routeForStep('samples'))
  return { profile, business, voice }
}

/**
 * Brief the coming week, if it is not briefed already. Never throws: the
 * caller decides whether a failure is fatal (it is not, after a build) and
 * gets the user-facing message back to show or discard.
 */
async function briefWeek(
  userId: string,
  strategy: Strategy,
  business: BusinessProfile,
  voice: VoiceProfile,
  timeZone: string,
  llm: FallbackSession,
): Promise<StrategyActionResult> {
  const weekIndex = upcomingWeekIndex(strategy.startsOn, todayInTimeZone(timeZone))
  if (weekIndex === null) {
    return { ok: false, message: 'Your twelve weeks are complete -- there is no upcoming week to brief.' }
  }
  const slots = strategy.slots.filter((slot) => slot.weekIndex === weekIndex)
  if (slots.length > 0 && slots.every((slot) => slot.status === 'briefed')) {
    return { ok: true }
  }

  try {
    const briefs = await draftWeek(strategy, business, voice, weekIndex, llm)
    const updated = await saveSlotBriefs(userId, briefs)
    if (updated !== briefs.length) {
      // The scope filtered some rows out, or the strategy changed under us.
      // Either way the week is not fully briefed, and saying so is better
      // than a half-briefed week presented as done.
      throw new Error(`saveSlotBriefs updated ${updated} of ${briefs.length} slots`)
    }
  } catch (error) {
    console.error(
      `LinkBud: briefWeek failed for user ${userId} week ${weekIndex} - ${describeErrorForLog(error)}`,
    )
    return { ok: false, message: describeStrategyError(error) }
  }
  return { ok: true }
}

/**
 * Build (or rebuild) the user's 12-week strategy, brief the coming week, and
 * land on `/strategy`.
 *
 * Used for the first build from `/onboarding/strategy` and for "Regenerate"
 * on `/strategy` (Ruling R-M3-7): `replaceStrategy` handles both, bumping
 * the version on a rebuild. The onboarding step is advanced only when the
 * user is actually at `strategy` -- a regenerating `paywall` user must not
 * be moved anywhere.
 */
export async function buildStrategy(): Promise<StrategyActionResult> {
  const userId = await requireUserId()
  const { profile, business, voice } = await loadInputs(userId)

  // One fallback session for all six model calls: a provider observed down
  // on the first is not re-proven down on any of the rest.
  const llm = createFallbackSession()

  let strategy: Strategy
  try {
    const draft = await generateStrategy({
      business,
      voice,
      cadencePerWeek: profile.cadencePerWeek,
      timeZone: profile.timezone,
      llm,
    })
    strategy = await replaceStrategy(userId, draft)
  } catch (error) {
    console.error(`LinkBud: buildStrategy failed for user ${userId} - ${describeErrorForLog(error)}`)
    return { ok: false, message: describeStrategyError(error) }
  }

  // The strategy is durable from here. Advance the step and revalidate NOW,
  // before the brief call -- see the module comment for why the order is
  // load-bearing.
  if (profile.onboardingStep === 'strategy') {
    try {
      await updateProfile(userId, { onboardingStep: nextStep('strategy') })
    } catch (error) {
      console.error(
        `LinkBud: buildStrategy failed to advance onboarding for user ${userId} - ${describeErrorForLog(error)}`,
      )
      return {
        ok: false,
        message: 'Your strategy is saved, but moving you on to it failed. Try again.',
      }
    }
  }
  revalidatePath('/strategy')
  revalidatePath('/calendar')
  revalidatePath('/dashboard')

  // Non-fatal by design: the strategy is durable and the step is advanced,
  // and /strategy offers this step again if it did not complete here.
  const briefed = await briefWeek(userId, strategy, business, voice, profile.timezone, llm)
  if (!briefed.ok) {
    console.warn(`LinkBud: strategy built for user ${userId} but the first week was not briefed`)
  }

  // Ruling R-M3-6: the strategy is the deliverable, so it is the first
  // thing seen -- not the dashboard.
  redirect('/strategy')
}

/**
 * The retry for a first week that was not briefed during the build (or the
 * upcoming week, once a later week comes round -- until Milestone 6's
 * `draft_week` job takes this over). Stays on the page: the re-render
 * arrives in the same response via `revalidatePath`.
 */
export async function briefUpcomingWeek(): Promise<StrategyActionResult> {
  const userId = await requireUserId()
  const { profile, business, voice } = await loadInputs(userId)

  const strategy = await getStrategy(userId)
  if (!strategy) {
    return { ok: false, message: 'There is no strategy to brief yet. Build one first.' }
  }

  const result = await briefWeek(
    userId,
    strategy,
    business,
    voice,
    profile.timezone,
    createFallbackSession(),
  )
  if (result.ok) {
    revalidatePath('/strategy')
    revalidatePath('/calendar')
    revalidatePath('/dashboard')
  }
  return result
}
