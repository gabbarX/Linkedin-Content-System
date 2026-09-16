import { describe, expect, it } from 'vitest'
import { ONBOARDING_STEPS } from './steps'
import { dashboardCopyForStep } from './dashboard-copy'

describe('dashboardCopyForStep', () => {
  it('covers every declared onboarding step without throwing', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(() => dashboardCopyForStep(step)).not.toThrow()
    }
  })

  it('tells an interview-step user to finish the interview', () => {
    const copy = dashboardCopyForStep('interview')
    expect(copy.needsYouNow).toMatch(/interview/i)
  })

  it('tells a samples-step user to add writing samples', () => {
    const copy = dashboardCopyForStep('samples')
    expect(copy.needsYouNow).toMatch(/writing sample/i)
  })

  it('tells a voice-step user to review their voice profile', () => {
    const copy = dashboardCopyForStep('voice')
    expect(copy.needsYouNow).toMatch(/voice profile/i)
  })

  // Reached only if the (onboarded) guard is weakened -- a strategy-step
  // user is normally redirected to /onboarding/strategy (Ruling R-M3-5).
  // Must point at the one thing they can do, without alarming them.
  it('tells a strategy-step user to build their strategy, without alarming them', () => {
    const copy = dashboardCopyForStep('strategy')
    expect(copy.needsYouNow).toMatch(/build your .*strategy/i)
    expect(copy.needsYouNow).not.toMatch(/error|failed|wrong|sorry|in progress on our end/i)
  })

  // The common case after Milestone 3 (Ruling R-M3-6): the user has a
  // strategy and this week's briefs, and billing has not shipped. Must say
  // the plan exists, must not claim it is still being built, must not say
  // "finish onboarding" (they did).
  it('tells a paywall-step user their strategy is ready and billing is coming', () => {
    const copy = dashboardCopyForStep('paywall')
    expect(copy.needsYouNow).toMatch(/billing/i)
    expect(copy.needsYouNow).toMatch(/strategy .*ready|ready on the strategy page/i)
    expect(copy.needsYouNow).not.toMatch(/finish onboarding|hasn't been built|in progress/i)
  })

  // Through Milestone 2 this read "Your radar starts once your strategy
  // exists" -- false the moment one does. Whatever it says must be true
  // both before and after a strategy exists.
  it('never claims the radar is waiting on the strategy', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(dashboardCopyForStep(step).world).not.toMatch(/once your strategy exists/i)
    }
  })

  it('gives a done user a plain empty state, no onboarding language at all', () => {
    const copy = dashboardCopyForStep('done')
    expect(copy.needsYouNow).not.toMatch(/onboarding|interview|voice profile|writing sample/i)
  })

  it('gives every step a non-empty message for all three bands', () => {
    for (const step of ONBOARDING_STEPS) {
      const copy = dashboardCopyForStep(step)
      expect(copy.needsYouNow.length).toBeGreaterThan(0)
      expect(copy.world.length).toBeGreaterThan(0)
      expect(copy.working.length).toBeGreaterThan(0)
    }
  })

  it('gives each of the six steps a distinct "needs you now" message', () => {
    const messages = ONBOARDING_STEPS.map((step) => dashboardCopyForStep(step).needsYouNow)
    expect(new Set(messages).size).toBe(ONBOARDING_STEPS.length)
  })
})
