import { describe, expect, it } from 'vitest'
import {
  SUBSCRIPTION_STATUSES,
  describeStatus,
  isEntitled,
  isSubscriptionStatus,
  type SubscriptionStatus,
} from './subscription'

describe('SUBSCRIPTION_STATUSES', () => {
  it("is exactly Razorpay's eight documented states", () => {
    expect([...SUBSCRIPTION_STATUSES]).toEqual([
      'created',
      'authenticated',
      'active',
      'pending',
      'halted',
      'cancelled',
      'completed',
      'expired',
    ])
  })
})

describe('isEntitled', () => {
  // A table over the full status list rather than two assertions, so adding a
  // ninth status to SUBSCRIPTION_STATUSES without deciding what it means for
  // access fails this test instead of silently defaulting to "no access" --
  // or worse, to "access".
  const ENTITLEMENT: Record<SubscriptionStatus, boolean> = {
    created: false,
    authenticated: true,
    active: true,
    pending: false,
    halted: false,
    cancelled: false,
    completed: false,
    expired: false,
  }

  it('covers every status in SUBSCRIPTION_STATUSES', () => {
    expect(Object.keys(ENTITLEMENT).sort()).toEqual([...SUBSCRIPTION_STATUSES].sort())
  })

  for (const status of SUBSCRIPTION_STATUSES) {
    it(`${status} -> ${ENTITLEMENT[status] ? 'entitled' : 'not entitled'}`, () => {
      expect(isEntitled(status)).toBe(ENTITLEMENT[status])
    })
  }

  it('treats no subscription at all as not entitled', () => {
    expect(isEntitled(null)).toBe(false)
  })
})

describe('isSubscriptionStatus', () => {
  for (const status of SUBSCRIPTION_STATUSES) {
    it(`accepts ${status}`, () => {
      expect(isSubscriptionStatus(status)).toBe(true)
    })
  }

  // 'trialing' is Stripe's vocabulary and 'paused' is a Razorpay *event* but
  // not a subscription state -- both are the shape of mistake this narrowing
  // exists to catch.
  it.each([['trialing'], ['ACTIVE'], [''], ['paused'], ['Active ']])('rejects %o', (value) => {
    expect(isSubscriptionStatus(value)).toBe(false)
  })

  it.each([[null], [undefined], [42], [{}], [['active']]])('rejects the non-string %o', (value) => {
    expect(isSubscriptionStatus(value)).toBe(false)
  })
})

describe('describeStatus', () => {
  it('has real copy for every status', () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      const described = describeStatus(status)
      expect(described.label.length).toBeGreaterThan(0)
      expect(described.detail.length).toBeGreaterThan(0)
      expect(described.label).not.toMatch(/TODO|TBD/i)
      expect(described.detail).not.toMatch(/TODO|TBD/i)
    }
  })

  it('never mentions a milestone number or an internal status value to the user', () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      const described = describeStatus(status)
      expect(`${described.label} ${described.detail}`).not.toMatch(/Milestone|razorpay_/i)
    }
  })

  it('marks the entitled states good, the recoverable ones warn and the final ones ended', () => {
    expect(describeStatus('active').tone).toBe('good')
    expect(describeStatus('authenticated').tone).toBe('good')
    expect(describeStatus('pending').tone).toBe('warn')
    expect(describeStatus('halted').tone).toBe('warn')
    expect(describeStatus('created').tone).toBe('warn')
    expect(describeStatus('cancelled').tone).toBe('ended')
    expect(describeStatus('completed').tone).toBe('ended')
    expect(describeStatus('expired').tone).toBe('ended')
  })

  it('gives a good tone to exactly the statuses that grant access', () => {
    // The panel's colour and the user's actual access must agree. If they ever
    // diverge, the page tells someone they are fine while the guard turns them
    // away -- the most confusing failure this screen can have.
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(describeStatus(status).tone === 'good').toBe(isEntitled(status))
    }
  })
})
