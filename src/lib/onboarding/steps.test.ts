import { describe, expect, it } from 'vitest'
import { ONBOARDING_STEPS } from '@/server/db/repositories/profiles'
import { isComplete, nextStep, routeForStep } from './steps'

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
