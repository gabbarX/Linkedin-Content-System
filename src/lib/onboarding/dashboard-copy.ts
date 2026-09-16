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
 * `paywall` is where every user who finishes Milestone 3's strategy step
 * lands (Ruling R-M3-6): they have a strategy and this week's briefs, and
 * Milestone 4's billing has not shipped. Its copy must be true for exactly
 * that person -- their plan exists and is on the Strategy page; nothing is
 * being asked of them yet.
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
          "Nothing to approve yet. Your strategy and this week's briefs are ready on the Strategy page; billing isn't set up on your account yet, and we'll prompt you here as soon as it is.",
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
