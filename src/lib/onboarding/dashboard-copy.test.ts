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

  // The common case for a user who has just finished everything this
  // milestone builds (Ruling R11): must not say "finish onboarding" (they
  // did) and must not read as an error or a failure on their part.
  it('tells a strategy-step user the truth without alarming them', () => {
    const copy = dashboardCopyForStep('strategy')
    expect(copy.needsYouNow).not.toMatch(/finish onboarding/i)
    expect(copy.needsYouNow).toMatch(/strategy/i)
    expect(copy.needsYouNow).not.toMatch(/error|failed|wrong|sorry/i)
  })

  it('tells a paywall-step user billing is coming, not that they failed to do something', () => {
    const copy = dashboardCopyForStep('paywall')
    expect(copy.needsYouNow).toMatch(/billing/i)
    expect(copy.needsYouNow).not.toMatch(/finish onboarding/i)
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
