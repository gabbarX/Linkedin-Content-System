import type { OnboardingStep } from './steps'

/**
 * What the dashboard's three empty-state bands say for a user at a given
 * onboarding step (Task 11, spec §6).
 *
 * The three band titles are fixed (spec §6): "Needs you now", "What's
 * happening in your world", "What's working". This is only their body copy
 * for a band with nothing in it yet -- once a real approval, trend or
 * result exists, the dashboard renders that instead of any of this.
 *
 * `interview`, `samples` and `voice` are unreachable here in normal use --
 * `(app)/(onboarded)/layout.tsx`'s guard (`onboardingRouteFor`) sends a
 * user at any of those three straight to the matching onboarding page
 * before this ever renders. They are still given real copy, both because
 * `OnboardingStep` is a 6-value union and an exhaustive switch demands it,
 * and because a defensive fallback is worth more than a stale message if
 * that guard is ever weakened.
 *
 * `strategy` is the step every user who finishes this milestone's
 * onboarding actually lands on -- Ruling R11: the voice step advances via
 * `nextStep('voice')`, which is `'strategy'`, not `'done'`, because
 * Milestone 3 owns strategy generation and marking a user done before a
 * strategy exists would silently skip them past it. `onboardingRouteFor
 * ('strategy')` is `null`, so these users reach exactly this branch. Its
 * copy must say something true and reassuring: there is no strategy
 * because Milestone 3 has not shipped strategy generation yet, not because
 * the user skipped anything. The old hard-coded "Finish onboarding to get
 * your first week" was false for exactly this user and is what this
 * module replaces.
 *
 * `paywall` is Milestone 4's step, also unreached in this milestone (no
 * page built for it yet, same as `strategy`), given the same honest
 * treatment for the same reason.
 *
 * `done` is the step once every milestone through billing has shipped and
 * actually run for this user -- still not reachable by any code path in
 * this milestone, but a real state the type admits, so it gets real copy
 * rather than falling through to `strategy`'s.
 */
export type DashboardBandCopy = {
  /** "Needs you now" -- posts waiting for approval. */
  needsYouNow: string
  /** "What's happening in your world" -- trend radar. */
  world: string
  /** "What's working" -- published-post performance. */
  working: string
}

const RADAR_AWAITS_STRATEGY = 'Your radar starts once your strategy exists.'
const NO_PUBLISHED_POSTS = 'No published posts yet.'

export function dashboardCopyForStep(step: OnboardingStep): DashboardBandCopy {
  switch (step) {
    case 'interview':
      return {
        needsYouNow: 'Finish the interview to get your first week of drafts going.',
        world: RADAR_AWAITS_STRATEGY,
        working: NO_PUBLISHED_POSTS,
      }
    case 'samples':
      return {
        needsYouNow: 'Add a few writing samples to build your voice profile.',
        world: RADAR_AWAITS_STRATEGY,
        working: NO_PUBLISHED_POSTS,
      }
    case 'voice':
      return {
        needsYouNow: 'Review your voice profile to finish onboarding.',
        world: RADAR_AWAITS_STRATEGY,
        working: NO_PUBLISHED_POSTS,
      }
    case 'strategy':
      return {
        needsYouNow:
          "Nothing to approve yet -- your 12-week strategy hasn't been built yet. That's still in progress on our end; there's nothing you need to do here.",
        world: RADAR_AWAITS_STRATEGY,
        working: NO_PUBLISHED_POSTS,
      }
    case 'paywall':
      return {
        needsYouNow:
          "Nothing to approve yet -- billing isn't set up on your account yet. We'll prompt you here as soon as it is.",
        world: RADAR_AWAITS_STRATEGY,
        working: NO_PUBLISHED_POSTS,
      }
    case 'done':
      return {
        needsYouNow: "Nothing to approve yet. Your next batch of drafts will show up here.",
        world: RADAR_AWAITS_STRATEGY,
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
