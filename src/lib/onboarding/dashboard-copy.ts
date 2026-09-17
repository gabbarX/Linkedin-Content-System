import type { OnboardingStep } from './steps'

/**
 * What the dashboard's three empty-state bands say for a user at a given
 * onboarding step (spec §6).
 *
 * The three band titles are fixed (spec §6): "Needs you now", "What's
 * happening in your world", "What's working". This is only their body copy
 * for a band with nothing in it yet -- once a real approval, trend or
 * result exists, the dashboard renders that instead of any of this. From
 * Milestone 3 the first band shows the next scheduled slot when a strategy
 * exists (Ruling R-M3-8), so its copy below is reached only when there is
 * no slot to show.
 *
 * `interview`, `samples`, `voice` and `strategy` are unreachable here in
 * normal use -- `(app)/(onboarded)/layout.tsx`'s guard (`onboardingRouteFor`)
 * sends a user at any of those straight to the matching onboarding page
 * before this ever renders. They are still given real copy, both because
 * `OnboardingStep` is a 6-value union and an exhaustive switch demands it,
 * and because a defensive fallback is worth more than a stale message if
 * that guard is ever weakened.
 *
 * `paywall` changed meaning in Milestone 4 (spec §1.2, amended 2026-09-17).
 * It used to sit *after* the strategy step, so its copy said the plan was
 * ready and nothing was being asked. The card now comes *before* the strategy,
 * which makes that exactly backwards: a user at this step has a Voice Profile,
 * has no strategy, and has one thing to do. Like the four steps above it, it
 * is unreachable here in normal use -- the guard sends a `paywall` user to
 * `/billing` -- but the copy has to be true if it is ever seen.
 *
 * No copy in this file names a milestone or apologises for an unbuilt feature.
 * The user did not read the roadmap, and the previous "we'll prompt you here
 * as soon as it is" was true for a fortnight and false afterwards. A test
 * pins it.
 *
 * `done` is the step once every milestone through billing has shipped and
 * actually run for this user -- not reachable by any code path yet, but a
 * real state the type admits, so it gets real copy.
 *
 * The radar copy was "Your radar starts once your strategy exists" through
 * Milestone 2. That became false the day a strategy could exist, so it now
 * says what is true: the radar is not switched on yet (Milestone 8).
 */
export type DashboardBandCopy = {
  /** "Needs you now" -- posts waiting for approval. */
  needsYouNow: string
  /** "What's happening in your world" -- trend radar. */
  world: string
  /** "What's working" -- published-post performance. */
  working: string
}

export const RADAR_NOT_YET =
  "The trend radar isn't switched on yet. When it is, each day's items from your niche will appear here, one tap from a draft."
const NO_PUBLISHED_POSTS = 'No published posts yet.'

/**
 * The first band's line when it is showing a real slot.
 *
 * These live here rather than inline in `dashboard/page.tsx` because the rule
 * that no copy may name a milestone or apologise for an unbuilt feature is
 * enforced by a test over this module, and the string that used to sit in the
 * page -- "drafting and publishing arrive in later releases" -- was exactly
 * the thing that rule forbids while sitting outside its reach. Moving it here
 * puts it under the test rather than fixing one string and leaving the next
 * person the same hole.
 */
export const NEXT_SLOT_UNWRITTEN =
  'Nothing written for this one yet. Three drafts take about a minute.'
export const NEXT_SLOT_DRAFTED = 'You have a draft going for this one.'
export const NEXT_SLOT_READY = 'This one is marked ready. You publish it yourself when it is time.'

export function dashboardCopyForStep(step: OnboardingStep): DashboardBandCopy {
  switch (step) {
    case 'interview':
      return {
        needsYouNow: 'Finish the interview to get your first week of drafts going.',
        world: RADAR_NOT_YET,
        working: NO_PUBLISHED_POSTS,
      }
    case 'samples':
      return {
        needsYouNow: 'Add a few writing samples to build your voice profile.',
        world: RADAR_NOT_YET,
        working: NO_PUBLISHED_POSTS,
      }
    case 'voice':
      return {
        needsYouNow: 'Review your voice profile to finish onboarding.',
        world: RADAR_NOT_YET,
        working: NO_PUBLISHED_POSTS,
      }
    case 'strategy':
      return {
        needsYouNow: 'Build your 12-week strategy to get your first week of briefs.',
        world: RADAR_NOT_YET,
        working: NO_PUBLISHED_POSTS,
      }
    case 'paywall':
      return {
        needsYouNow:
          'Start your subscription to have your 12-week strategy built. Your voice profile is saved and waiting.',
        world: RADAR_NOT_YET,
        working: NO_PUBLISHED_POSTS,
      }
    case 'done':
      return {
        needsYouNow: 'Nothing to approve yet. Your next batch of drafts will show up here.',
        world: RADAR_NOT_YET,
        working: NO_PUBLISHED_POSTS,
      }
    default: {
      // Exhaustiveness check: a 7th step added to OnboardingStep without a
      // case here is a compile error, not a silent wrong message.
      const exhaustive: never = step
      return exhaustive
    }
  }
}
