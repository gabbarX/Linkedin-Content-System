/**
 * The onboarding step vocabulary and state machine.
 *
 * `ONBOARDING_STEPS` and `OnboardingStep` live here rather than in
 * `src/server/db/repositories/profiles.ts` (which re-exports them for
 * existing import sites) per Ruling R9: they are domain knowledge — the
 * fixed order onboarding proceeds through — not data access. That
 * repository module is marked `server-only`; this one must not be, because
 * Tasks 7-9 build the onboarding wizard, and the moment a Client Component
 * imports this file — directly or transitively — a `server-only` import
 * anywhere in its dependency chain fails the build with an error pointing
 * at the wrong file. (Same reasoning as `CadencePerWeek` in
 * `src/lib/onboarding/questions.ts`.) This file must therefore import
 * nothing from `@/server/db/**`.
 */
export const ONBOARDING_STEPS = [
  'interview',
  'samples',
  'voice',
  'strategy',
  'paywall',
  'done',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/**
 * The onboarding page for a step, for the steps that have one in this
 * milestone. The single source both `routeForStep` and `onboardingRouteFor`
 * read from — see their doc comments for why two functions exist over one
 * map. Add a step's page here once Milestones 3+ build it, and both
 * functions (and the wizard, and the guard) pick it up together; there is
 * nowhere else a page path is written down.
 */
const PAGE_ROUTE_BY_STEP: Partial<Record<OnboardingStep, string>> = {
  interview: '/onboarding/interview',
  samples: '/onboarding/samples',
  voice: '/onboarding/voice',
}

/**
 * The onboarding state machine — where each step routes to, and what comes
 * next.
 *
 * Two functions answer two different questions about routing, and both are
 * defined here because they look similar enough to conflate by accident:
 *
 * - `routeForStep` answers "where does this user belong overall" — the
 *   wizard uses it once a step's own work is done, to send the user
 *   onward (including the final step, which lands on `/dashboard`).
 * - `onboardingRouteFor` answers the narrower "is there an onboarding page
 *   to force this user onto right now" — `null` for a step with no page in
 *   this milestone. It exists because Ruling R8 (see
 *   .superpowers/sdd/2026-09-16-linkbud-onboarding/progress.md) moved the
 *   dashboard's onboarding guard into its own route group
 *   (`(app)/(onboarded)/layout.tsx`), which must never redirect a `strategy`
 *   or `paywall` user away from the dashboard — there is nowhere else to
 *   send them. `routeForStep` cannot answer that on its own because it
 *   always returns *something* (falling back to `/dashboard` for exactly
 *   those two steps, per R3), which is right for the wizard's "send them
 *   onward" question and wrong for the guard's "should I redirect at all"
 *   question.
 *
 * Both are defined in terms of `PAGE_ROUTE_BY_STEP` rather than each
 * hardcoding the three onboarding paths in its own switch: a step's page
 * path is written down exactly once, so the wizard and the guard cannot
 * drift apart by one of two copies being updated and the other forgotten.
 *
 * Ruling R3: `routeForStep('strategy' | 'paywall')` is `/dashboard` because
 * Milestones 3 and 4 own those steps and have not built pages yet. Routing a
 * user at either step to a route that 404s is worse than routing them to the
 * dashboard they will eventually reach anyway. This is a deliberate,
 * temporary exception — not evidence that an unfinished user may reach the
 * dashboard in general. The invariant that must hold, and is tested, is
 * narrower and absolute: a user who has not finished the interview, samples
 * or voice steps can never reach the dashboard.
 */
export function routeForStep(step: OnboardingStep): string {
  return PAGE_ROUTE_BY_STEP[step] ?? '/dashboard'
}

/**
 * The onboarding page a user at `step` must finish before reaching the
 * product, or `null` if there is none to force them onto.
 *
 * `null` for `strategy`, `paywall` and `done` — the first two because
 * Milestones 3-4 haven't built their pages yet (Ruling R3), the last
 * because onboarding is finished. `(app)/(onboarded)/layout.tsx` redirects
 * only when this returns non-null, so it never redirects a `strategy` or
 * `paywall` user away from the dashboard — the one route they're actually
 * allowed on. Combined with `src/app/(app)/onboarding/**` living outside
 * the `(onboarded)` route group (so it never runs through this guard at
 * all), a redirect loop is structurally impossible rather than avoided by
 * comparing the current path against a target, which was the previous,
 * rejected approach (Ruling R8).
 */
export function onboardingRouteFor(step: OnboardingStep): string | null {
  return PAGE_ROUTE_BY_STEP[step] ?? null
}

/**
 * The step after `current`, in the fixed order onboarding proceeds through.
 * `done` is absorbing — there is nothing after it, and calling this once
 * onboarding is finished is a no-op rather than an error.
 */
export function nextStep(current: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(current)
  const next = ONBOARDING_STEPS[index + 1]
  return next ?? 'done'
}

/** Whether onboarding is finished and the user may use the product proper. */
export function isComplete(step: OnboardingStep): boolean {
  return step === 'done'
}
