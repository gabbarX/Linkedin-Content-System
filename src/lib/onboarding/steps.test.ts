import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_STEPS,
  isComplete,
  isPastStep,
  nextStep,
  onboardingRouteFor,
  routeForStep,
} from './steps'

/** The steps that have an onboarding page today. Milestone 4 adds `paywall`. */
const STEPS_WITH_A_PAGE = ['interview', 'samples', 'voice', 'strategy'] as const

describe('routeForStep', () => {
  it('routes each step with a page to that page', () => {
    expect(routeForStep('interview')).toBe('/onboarding/interview')
    expect(routeForStep('samples')).toBe('/onboarding/samples')
    expect(routeForStep('voice')).toBe('/onboarding/voice')
    expect(routeForStep('strategy')).toBe('/onboarding/strategy')
    expect(routeForStep('done')).toBe('/dashboard')
  })

  // Ruling R3, narrowed by Milestone 3 (R-M3-5): the invariant is absolute
  // for every step that has a page. A user who has not built a strategy has
  // nothing true to see on the dashboard, so `strategy` joined this list.
  it('never routes a user who has not finished a step with a page to the dashboard', () => {
    for (const step of STEPS_WITH_A_PAGE) {
      expect(routeForStep(step)).not.toBe('/dashboard')
    }
  })

  // Documents the one remaining deliberate exception, so it reads as a
  // decision and not an oversight if someone tightens the test above later.
  it('routes paywall to /dashboard until Milestone 4 builds its page', () => {
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
  it('names the onboarding page for each step that has one', () => {
    expect(onboardingRouteFor('interview')).toBe('/onboarding/interview')
    expect(onboardingRouteFor('samples')).toBe('/onboarding/samples')
    expect(onboardingRouteFor('voice')).toBe('/onboarding/voice')
    expect(onboardingRouteFor('strategy')).toBe('/onboarding/strategy')
  })

  // Ruling R8: paywall must be null, not routeForStep's '/dashboard'
  // fallback — (app)/(onboarded)/layout.tsx redirects only when this returns
  // non-null, so a null here is what stops it from redirecting a paywall
  // user away from the one route (the dashboard) they're actually allowed on.
  it('is null for paywall and done — nothing to force the user onto', () => {
    expect(onboardingRouteFor('paywall')).toBeNull()
    expect(onboardingRouteFor('done')).toBeNull()
  })

  // The invariant that actually matters, restated in terms of the function
  // (onboarded)/layout.tsx calls: for every step with a page, there is
  // something to redirect to, so the guard fires. This is what makes "a user
  // who has not finished onboarding cannot reach the dashboard" true in the
  // running app, not just in routeForStep's output.
  it('is truthy for every step short of done except paywall', () => {
    const stepsWithNoPageYet = new Set(['paywall', 'done'])
    for (const step of ONBOARDING_STEPS) {
      if (stepsWithNoPageYet.has(step)) continue
      expect(onboardingRouteFor(step)).toBeTruthy()
    }
  })

  // The drift this whole file exists to rule out: both functions read from
  // one shared map (PAGE_ROUTE_BY_STEP), but that's an implementation detail
  // this test doesn't rely on — it re-derives the guarantee from the public
  // API instead, so it would still catch the two functions being hand-
  // desynced even if that map disappeared tomorrow.
  it('agrees with routeForStep for every step it names a page for', () => {
    for (const step of ONBOARDING_STEPS) {
      const forced = onboardingRouteFor(step)
      if (forced === null) continue
      expect(forced).toBe(routeForStep(step))
    }
  })
})

describe('isPastStep', () => {
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
    expect(isPastStep('voice', 'strategy')).toBe(false)
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
    expect(isPastStep('paywall', 'strategy')).toBe(true)
    expect(isPastStep('done', 'voice')).toBe(true)
  })
})
