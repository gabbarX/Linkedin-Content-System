import { ONBOARDING_STEPS, type OnboardingStep } from '@/server/db/repositories/profiles'

/**
 * The onboarding state machine — where each step routes to, and what comes
 * next. `(app)/layout.tsx` uses `routeForStep` to redirect an incomplete
 * user; the onboarding wizard pages use `nextStep` to advance once a step's
 * own work is done.
 *
 * Ruling R3 (see .superpowers/sdd/2026-09-16-linkbud-onboarding/progress.md):
 * `strategy` and `paywall` route to `/dashboard` because Milestones 3 and 4
 * own those steps and have not built pages yet. Routing a user at either step
 * to a route that 404s is worse than routing them to the dashboard they will
 * eventually reach anyway. This is a deliberate, temporary exception — not
 * evidence that an unfinished user may reach the dashboard in general. The
 * invariant that must hold, and is tested, is narrower and absolute: a user
 * who has not finished the interview, samples or voice steps can never reach
 * the dashboard.
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
