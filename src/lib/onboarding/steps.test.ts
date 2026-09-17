import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_STEPS,
  isComplete,
  isPastStep,
  nextStep,
  onboardingRouteFor,
  routeForStep,
} from './steps'

/**
 * Every step except `done` now has a page. Milestone 4 built `/billing` for
 * `paywall`, which retired Ruling R3's temporary exception -- so this list is
 * no longer a subset of ONBOARDING_STEPS but all of it bar the last.
 */
const STEPS_WITH_A_PAGE = ['interview', 'samples', 'voice', 'paywall', 'strategy'] as const

describe('routeForStep', () => {
  it('routes each step with a page to that page', () => {
    expect(routeForStep('interview')).toBe('/onboarding/interview')
    expect(routeForStep('samples')).toBe('/onboarding/samples')
    expect(routeForStep('voice')).toBe('/onboarding/voice')
    expect(routeForStep('paywall')).toBe('/billing')
    expect(routeForStep('strategy')).toBe('/onboarding/strategy')
    expect(routeForStep('done')).toBe('/dashboard')
  })

  // Ruling R3 is retired (Milestone 4). The invariant is now unconditional:
  // there is no step short of `done` that routes to the dashboard, because
  // there is no step short of `done` without a page of its own.
  it('never routes a user who has not finished a step with a page to the dashboard', () => {
    for (const step of STEPS_WITH_A_PAGE) {
      expect(routeForStep(step)).not.toBe('/dashboard')
    }
  })

  // The exception this replaces -- `paywall` falling through to /dashboard --
  // existed only because Milestone 4 had not built a page. It has. Nothing
  // short of `done` may route to the dashboard now, and this is the test that
  // stops the fallback quietly coming back.
  it('leaves no step short of done falling through to the dashboard', () => {
    for (const step of ONBOARDING_STEPS) {
      if (step === 'done') continue
      expect(routeForStep(step)).not.toBe('/dashboard')
    }
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
    // Spec 1.2, amended 2026-09-17: the card comes before the strategy, so
    // the voice step now lands on the paywall and a paid user goes on to
    // build their plan.
    expect(nextStep('voice')).toBe('paywall')
    expect(nextStep('paywall')).toBe('strategy')
    expect(nextStep('strategy')).toBe('done')
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
    expect(onboardingRouteFor('paywall')).toBe('/billing')
    expect(onboardingRouteFor('strategy')).toBe('/onboarding/strategy')
  })

  // `done` is the only null now. Ruling R8 still holds and is now carried
  // entirely by route-group structure rather than by this function returning
  // null: /billing and /onboarding/** are siblings of the (onboarded) group,
  // so a request to either never renders through the guard that calls this,
  // and a redirect loop is impossible rather than avoided.
  it('is null only for done — onboarding is over, there is nothing to force', () => {
    expect(onboardingRouteFor('done')).toBeNull()
  })

  // The invariant that actually matters, restated in terms of the function
  // (onboarded)/layout.tsx calls: for every step with a page, there is
  // something to redirect to, so the guard fires. This is what makes "a user
  // who has not finished onboarding cannot reach the dashboard" true in the
  // running app, not just in routeForStep's output.
  it('is truthy for every step short of done', () => {
    for (const step of ONBOARDING_STEPS) {
      if (step === 'done') continue
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
    // The reorder's consequence: a user at the paywall has NOT passed the
    // strategy step, they have not reached it. Before Milestone 4 this was
    // true, and /onboarding/strategy uses it to decide re-entry.
    expect(isPastStep('paywall', 'strategy')).toBe(false)
  })

  // The exact reentry bug this helper exists to fix: a user who finished
  // the samples step (and is now at voice, possibly with an edited Voice
  // Profile) hits Back to /onboarding/samples.
  it('is true for the samples-page reentry bug: a user now at voice', () => {
    expect(isPastStep('voice', 'samples')).toBe(true)
  })

  it('is true once onboarding has moved on to paywall, strategy or done', () => {
    expect(isPastStep('paywall', 'voice')).toBe(true)
    expect(isPastStep('strategy', 'voice')).toBe(true)
    expect(isPastStep('strategy', 'paywall')).toBe(true)
    expect(isPastStep('done', 'voice')).toBe(true)
    expect(isPastStep('done', 'strategy')).toBe(true)
  })

  it('orders the steps interview, samples, voice, paywall, strategy, done', () => {
    // The order is the whole state machine, and Milestone 4 changed it. Pinned
    // literally so a reorder has to be a deliberate edit to this line.
    expect([...ONBOARDING_STEPS]).toEqual([
      'interview',
      'samples',
      'voice',
      'paywall',
      'strategy',
      'done',
    ])
  })
})
