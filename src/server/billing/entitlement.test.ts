import { describe, expect, it } from 'vitest'
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '@/lib/billing/subscription'
import type { Subscription } from '@/server/db/repositories/subscriptions'
import { entitlementFor } from './entitlement'

function subscriptionWith(status: SubscriptionStatus): Subscription {
  return {
    userId: 'u1',
    razorpaySubscriptionId: 'sub_1',
    razorpayPlanId: 'plan_1',
    razorpayCustomerId: null,
    status,
    currentStart: null,
    currentEnd: null,
    chargeAt: null,
    cancelAtCycleEnd: false,
    endedAt: null,
    lastEventAt: null,
    createdAt: new Date('2026-09-17T00:00:00Z'),
    updatedAt: new Date('2026-09-17T00:00:00Z'),
  }
}

describe('entitlementFor', () => {
  it('denies a user with no subscription row at all', () => {
    expect(entitlementFor(null)).toBe(false)
  })

  it.each(SUBSCRIPTION_STATUSES.map((status) => [status]))(
    'grants %s exactly when the status vocabulary says so',
    (status) => {
      expect(entitlementFor(subscriptionWith(status))).toBe(
        status === 'active' || status === 'authenticated',
      )
    },
  )

  it('still grants access to a subscription cancelled at cycle end while it is active', () => {
    // The customer paid for the rest of the period. Razorpay keeps the status
    // at active until the cycle ends, and cutting them off early would be
    // taking money for a service withdrawn.
    expect(entitlementFor({ ...subscriptionWith('active'), cancelAtCycleEnd: true })).toBe(true)
  })

  it('denies once the cancellation has actually landed', () => {
    expect(entitlementFor({ ...subscriptionWith('cancelled'), cancelAtCycleEnd: true })).toBe(false)
  })

  it('ignores every field except the status', () => {
    // Entitlement must not start depending on a date comparison by accident:
    // an expired currentEnd on an active subscription is Razorpay's business
    // to resolve, and a clock skew here would lock out a paying customer.
    const stale = {
      ...subscriptionWith('active'),
      currentEnd: new Date('2020-01-01T00:00:00Z'),
      endedAt: new Date('2020-01-01T00:00:00Z'),
    }
    expect(entitlementFor(stale)).toBe(true)
  })
})
