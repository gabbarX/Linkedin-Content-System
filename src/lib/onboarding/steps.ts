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
  'paywall',
  'strategy',
  'done',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/**
 * The onboarding page for a step. The single source both `routeForStep` and
 * `onboardingRouteFor` read from — see their doc comments for why two
 * functions exist over one map. There is nowhere else a page path is written
 * down, which is why adding `paywall` here was the whole of Milestone 4's
 * change to the wizard: both functions, the guard and every call site picked
 * it up together.
 *
 * Every step except `done` now has a page. The type stays `Partial` because
 * `done` genuinely has none — onboarding is over — and that absence is exactly
 * what `onboardingRouteFor` returns null for.
 *
 * `paywall` points at `/billing` rather than an `/onboarding/paywall` of its
 * own. The two would render the same three states from the same row, and one
 * screen means one set of copy to keep true: the wizard's first payment and a
 * lapsed customer's renewal are the same act.
 */
const PAGE_ROUTE_BY_STEP: Partial<Record<OnboardingStep, string>> = {
  interview: '/onboarding/interview',
  samples: '/onboarding/samples',
  voice: '/onboarding/voice',
  paywall: '/billing',
  strategy: '/onboarding/strategy',
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
 *   to force this user onto right now" — `null` once onboarding is over. It
 *   exists because Ruling R8 (see
 *   .superpowers/sdd/2026-09-16-linkbud-onboarding/progress.md) moved the
 *   dashboard's onboarding guard into its own route group
 *   (`(app)/(onboarded)/layout.tsx`). `routeForStep` cannot answer that
 *   question on its own because it always returns *something*, falling back
 *   to `/dashboard` for `done` — right for the wizard's "send them onward"
 *   question and wrong for the guard's "should I redirect at all" question.
 *
 * Both are defined in terms of `PAGE_ROUTE_BY_STEP` rather than each
 * hardcoding the onboarding paths in its own switch: a step's page path is
 * written down exactly once, so the wizard and the guard cannot drift apart by
 * one of two copies being updated and the other forgotten.
 *
 * **Ruling R3 is retired (Milestone 4).** It let `routeForStep('paywall')`
 * fall through to `/dashboard`, because that step had no page and sending a
 * user to a 404 was worse than sending them somewhere they would reach
 * eventually. `/billing` exists now, so the exception is gone and the
 * invariant is unconditional: there is no step short of `done` that routes to
 * the dashboard, because there is no step short of `done` without a page of
 * its own. A user who has not finished the interview, samples, voice, paywall
 * or strategy steps can never reach the dashboard. A test pins it by iterating
 * `ONBOARDING_STEPS` rather than a hand-written list, so a step added later
 * cannot quietly reintroduce the fallback.
 */
export function routeForStep(step: OnboardingStep): string {
  return PAGE_ROUTE_BY_STEP[step] ?? '/dashboard'
}

/**
 * The onboarding page a user at `step` must finish before reaching the
 * product, or `null` if there is none to force them onto.
 *
 * `null` for `done` alone, because onboarding is finished and there is nothing
 * left to force. Every other step has a page.
 *
 * `(app)/(onboarded)/layout.tsx` redirects whenever this returns non-null. A
 * `paywall` user is sent to `/billing` and a `strategy` user to
 * `/onboarding/strategy` — a strategy is the day-one deliverable and nothing
 * on the dashboard is true without one (Ruling R-M3-5), and after Milestone 4
 * nothing is generated without a card.
 *
 * **The redirect loop is prevented structurally, not by comparing paths.**
 * Both `src/app/(app)/onboarding/**` and `src/app/(app)/billing` are siblings
 * of the `(onboarded)` route group rather than children of it, so a request to
 * either never renders through the guard that calls this. There is no current
 * path compared against a target, which was the previous, rejected approach
 * (Ruling R8). Any new route this function can return **must** be placed
 * outside `(onboarded)` for the same reason.
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

/**
 * Whether a user whose actual onboarding step is `current` has already
 * moved past `page` -- the step a given onboarding page renders.
 *
 * Each of `interview/page.tsx`, `samples/page.tsx` and `voice/page.tsx`
 * calls this with its own step as `page` and redirects to
 * `routeForStep(current)` when it is true (I1a). Without this, nothing
 * stopped a user who had already finished a step from reaching that step's
 * page again -- the browser's Back button is enough, since writing samples
 * and a derived Voice Profile are never deleted on success. From there,
 * re-running the samples step's derivation would silently overwrite a
 * human's edited Voice Profile (see `saveDerivedVoiceProfile`'s own
 * refusal, I1b, for the second half of that fix) and knock the user's
 * `onboarding_step` back a step.
 *
 * Compares indices in `ONBOARDING_STEPS` rather than a hand-written
 * ordering declared a third time. `current === page` (a user legitimately
 * on the page for their own current step) is deliberately `false`, not
 * `true` -- equal indices are never `>` -- so this only ever blocks
 * re-entry, never first entry.
 */
export function isPastStep(current: OnboardingStep, page: OnboardingStep): boolean {
  return ONBOARDING_STEPS.indexOf(current) > ONBOARDING_STEPS.indexOf(page)
}
