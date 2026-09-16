import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_STEPS,
  isComplete,
  isPastStep,
  nextStep,
  onboardingRouteFor,
  routeForStep,
} from './steps'

describe('routeForStep', () => {
  it('routes each step this milestone builds a page for to that page', () => {
    expect(routeForStep('interview')).toBe('/onboarding/interview')
    expect(routeForStep('samples')).toBe('/onboarding/samples')
    expect(routeForStep('voice')).toBe('/onboarding/voice')
    expect(routeForStep('done')).toBe('/dashboard')
  })

  // Ruling R3: the plan's own tests disagree with each other — one asserts
  // routeForStep(step) !== '/dashboard' for every step but 'done', while the
  // plan's own Step 2 requires 'paywall' to route to '/dashboard'. Both
  // cannot hold. 'strategy' and 'paywall' are owned by Milestones 3 and 4,
  // which do not exist yet; routing a user at either step to a 404 is worse
  // than routing them to the dashboard they'll eventually land on anyway. So
  // this test is deliberately narrowed to the three steps that have pages
  // — interview, samples, voice — where the invariant is absolute.
  it('never routes a user who has not finished the interview to the dashboard', () => {
    for (const step of ['interview', 'samples', 'voice'] as const) {
      expect(routeForStep(step)).not.toBe('/dashboard')
    }
  })

  // Documents the deliberate exception above, so it reads as a decision and
  // not an oversight if someone tightens the test above later.
  it('routes strategy and paywall to /dashboard until Milestones 3 and 4 build their pages', () => {
    expect(routeForStep('strategy')).toBe('/dashboard')
    expect(routeForStep('paywall')).toBe('/dashboard')
  })

  it('covers every declared onboarding step', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(() => routeForStep(step)).not.toThrow()
    }
  })
})

describe('nextStep', () => {
  it('advances strictly forward', () => {
    expect(nextStep('interview')).toBe('samples')
    expect(nextStep('samples')).toBe('voice')
    expect(nextStep('voice')).toBe('strategy')
    expect(nextStep('strategy')).toBe('paywall')
    expect(nextStep('paywall')).toBe('done')
  })

  it('stays at done rather than running off the end', () => {
    expect(nextStep('done')).toBe('done')
  })
})

describe('isComplete', () => {
  it('is true only for done', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(isComplete(step)).toBe(step === 'done')
    }
  })
})

describe('onboardingRouteFor', () => {
  it('names the onboarding page for each step this milestone built one for', () => {
    expect(onboardingRouteFor('interview')).toBe('/onboarding/interview')
    expect(onboardingRouteFor('samples')).toBe('/onboarding/samples')
    expect(onboardingRouteFor('voice')).toBe('/onboarding/voice')
  })

  // Ruling R8: strategy and paywall must be null, not routeForStep's
  // '/dashboard' fallback — (app)/(onboarded)/layout.tsx redirects only when
  // this returns non-null, so a null here is what stops it from redirecting
  // a strategy/paywall user away from the one route (the dashboard) they're
  // actually allowed on.
  it('is null for strategy, paywall and done — nothing to force the user onto', () => {
    expect(onboardingRouteFor('strategy')).toBeNull()
    expect(onboardingRouteFor('paywall')).toBeNull()
    expect(onboardingRouteFor('done')).toBeNull()
  })

  // The invariant that actually matters, restated in terms of the function
  // (onboarded)/layout.tsx calls: for every step this milestone built a page
  // for, there is something to redirect to, so the guard fires. This is what
  // makes "a user who has not finished the interview cannot reach the
  // dashboard" true in the running app, not just in routeForStep's output.
  it('is truthy for every step short of done except strategy and paywall', () => {
    const stepsWithNoPageYet = new Set(['strategy', 'paywall', 'done'])
    for (const step of ONBOARDING_STEPS) {
      if (stepsWithNoPageYet.has(step)) continue
      expect(onboardingRouteFor(step)).toBeTruthy()
    }
  })

  // The drift this whole file exists to rule out: both functions now read
  // from one shared map (PAGE_ROUTE_BY_STEP), but that's an implementation
  // detail this test doesn't rely on — it re-derives the guarantee from the
  // public API instead, so it would still catch the two functions being
  // hand-desynced even if that map disappeared tomorrow. Whenever there is
  // an onboarding page to force a step onto, it must be the same page
  // routeForStep would have sent that step to anyway.
  it('agrees with routeForStep for every step it names a page for', () => {
    for (const step of ONBOARDING_STEPS) {
      const forced = onboardingRouteFor(step)
      if (forced === null) continue
      expect(forced).toBe(routeForStep(step))
    }
  })
})

describe('isPastStep', () => {
  // Covers every step pair, not just the three the onboarding pages guard,
  // because the function itself makes no exception for the later steps --
  // it just compares indices.
  it('agrees with comparing ONBOARDING_STEPS indices, for every step pair', () => {
    for (const current of ONBOARDING_STEPS) {
      for (const page of ONBOARDING_STEPS) {
        const expected = ONBOARDING_STEPS.indexOf(current) > ONBOARDING_STEPS.indexOf(page)
        expect(isPastStep(current, page)).toBe(expected)
      }
    }
  })

  it('is false when the user is exactly at the page step -- must not block first entry', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(isPastStep(step, step)).toBe(false)
    }
  })

  it('is false when the user has not reached the page step yet', () => {
    expect(isPastStep('interview', 'samples')).toBe(false)
    expect(isPastStep('interview', 'voice')).toBe(false)
  })

  // The exact reentry bug this helper exists to fix: a user who finished
  // the samples step (and is now at voice, possibly with an edited Voice
  // Profile) hits Back to /onboarding/samples.
  it('is true for the samples-page reentry bug: a user now at voice', () => {
    expect(isPastStep('voice', 'samples')).toBe(true)
  })

  it('is true once onboarding has moved on to strategy, paywall or done', () => {
    expect(isPastStep('strategy', 'voice')).toBe(true)
    expect(isPastStep('paywall', 'voice')).toBe(true)
    expect(isPastStep('done', 'voice')).toBe(true)
  })
})
