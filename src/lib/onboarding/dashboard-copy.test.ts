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

  // The paywall step changed meaning in Milestone 4 (spec 1.2, amended
  // 2026-09-17). It used to sit AFTER the strategy, so its copy said the plan
  // was ready and billing was coming. It now sits BEFORE, so that copy is
  // exactly backwards: this user has a voice profile and NO strategy, and the
  // one thing being asked of them is the card.
  it('asks a paywall-step user for the card and does not claim a strategy exists', () => {
    const copy = dashboardCopyForStep('paywall')
    expect(copy.needsYouNow).toMatch(/subscription|subscribe|card|billing/i)
    expect(copy.needsYouNow).not.toMatch(/strategy .*ready|ready on the strategy page/i)
    expect(copy.needsYouNow).not.toMatch(/finish onboarding/i)
  })

  // Nothing here is allowed to name a milestone or apologise for an unbuilt
  // feature: the user did not read the roadmap, and "we'll prompt you as soon
  // as it is" was true for a fortnight and false afterwards.
  it('never mentions a milestone or an unshipped feature to the user', () => {
    for (const step of ONBOARDING_STEPS) {
      const copy = dashboardCopyForStep(step)
      expect(`${copy.needsYouNow} ${copy.world} ${copy.working}`).not.toMatch(
        /milestone|not shipped|isn't set up on your account/i,
      )
    }
  })

  // The version above only ever saw dashboardCopyForStep's output, so the one
  // string that actually broke the rule -- "drafting and publishing arrive in
  // later releases", which lived inline in dashboard/page.tsx -- passed it for
  // months. This one scans every string this module exports, so copy added
  // later is covered by construction rather than by someone remembering to
  // extend a test.
  it('holds every exported line to the same rule', async () => {
    const copyModule = await import('./dashboard-copy')
    // Collected with a loop rather than a filtering type predicate: the module's
    // exports are string *literal* types, and `value is string` is not
    // assignable to that union. A cast would silence it; narrowing earns it.
    const strings: string[] = []
    for (const value of Object.values(copyModule)) {
      if (typeof value === 'string') strings.push(value)
    }
    expect(strings.length).toBeGreaterThan(0)
    for (const line of strings) {
      expect(line).not.toMatch(
        /milestone|not shipped|later release|coming soon|arrives? (in|with)|future release/i,
      )
    }
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
