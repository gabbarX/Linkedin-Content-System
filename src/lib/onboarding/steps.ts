import { ONBOARDING_STEPS, type OnboardingStep } from '@/server/db/repositories/profiles'

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
  switch (step) {
    case 'interview':
      return '/onboarding/interview'
    case 'samples':
      return '/onboarding/samples'
    case 'voice':
      return '/onboarding/voice'
    case 'strategy':
    case 'paywall':
      // No page exists yet — see the ruling above. Update this once
      // Milestones 3 and 4 ship /onboarding/strategy and /onboarding/paywall.
      return '/dashboard'
    case 'done':
      return '/dashboard'
  }
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
  switch (step) {
    case 'interview':
      return '/onboarding/interview'
    case 'samples':
      return '/onboarding/samples'
    case 'voice':
      return '/onboarding/voice'
    case 'strategy':
    case 'paywall':
    case 'done':
      return null
  }
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
