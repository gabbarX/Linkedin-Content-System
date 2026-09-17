import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * These run against a fake Prisma client rather than the database. What is
 * under test is the SCOPING and the mapping — which is where a leak would be —
 * not that Postgres can store a row. The live constraints were verified when
 * 0005 was applied.
 */
const findUnique = vi.fn()
const upsert = vi.fn()
const updateMany = vi.fn()

vi.mock('../client', () => ({
  getPrisma: () => ({ subscriptions: { findUnique, upsert, updateMany } }),
}))

const { applySubscriptionEvent, getSubscription, upsertSubscription } = await import(
  './subscriptions'
)

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER_USER = '22222222-2222-2222-2222-222222222222'

function row(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER,
    razorpay_subscription_id: 'sub_1',
    razorpay_plan_id: 'plan_1',
    razorpay_customer_id: null,
    status: 'active',
    current_start: new Date('2026-09-17T00:00:00Z'),
    current_end: new Date('2026-10-17T00:00:00Z'),
    charge_at: new Date('2026-10-17T00:00:00Z'),
    cancel_at_cycle_end: false,
    ended_at: null,
    last_event_at: null,
    created_at: new Date('2026-09-17T00:00:00Z'),
    updated_at: new Date('2026-09-17T00:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  findUnique.mockReset()
  upsert.mockReset()
  updateMany.mockReset()
})

describe('getSubscription', () => {
  it('scopes the query to the given user', async () => {
    findUnique.mockResolvedValue(row())
    await getSubscription(USER)
    expect(findUnique).toHaveBeenCalledWith({ where: { user_id: USER } })
  })

  it('maps snake_case columns onto the camelCase type', async () => {
    findUnique.mockResolvedValue(row({ razorpay_customer_id: 'cust_9', cancel_at_cycle_end: true }))
    const subscription = await getSubscription(USER)
    expect(subscription).not.toBeNull()
    expect(subscription?.userId).toBe(USER)
    expect(subscription?.razorpaySubscriptionId).toBe('sub_1')
    expect(subscription?.razorpayPlanId).toBe('plan_1')
    expect(subscription?.razorpayCustomerId).toBe('cust_9')
    expect(subscription?.cancelAtCycleEnd).toBe(true)
    expect(subscription?.status).toBe('active')
    expect(subscription?.currentEnd).toEqual(new Date('2026-10-17T00:00:00Z'))
  })

  it('returns null when the user has never subscribed', async () => {
    findUnique.mockResolvedValue(null)
    expect(await getSubscription(USER)).toBeNull()
  })

  it('throws rather than guessing when the stored status is not one Razorpay defines', async () => {
    // A value outside the check constraint means the database and the code
    // have diverged. Coercing it would decide someone's access by accident,
    // and the safe-looking coercion (treat unknown as "no access") would lock
    // out a paying customer over a deploy-order mistake.
    findUnique.mockResolvedValue(row({ status: 'trialing' }))
    await expect(getSubscription(USER)).rejects.toThrow(/trialing/)
  })
})

describe('upsertSubscription', () => {
  it('keys the upsert on user_id and writes user_id only on create', async () => {
    upsert.mockResolvedValue(row())
    await upsertSubscription(USER, {
      razorpaySubscriptionId: 'sub_2',
      razorpayPlanId: 'plan_1',
      status: 'created',
    })
    const call = upsert.mock.calls[0]?.[0]
    expect(call.where).toEqual({ user_id: USER })
    expect(call.create.user_id).toBe(USER)
    expect(call.create.razorpay_subscription_id).toBe('sub_2')
    expect(call.update.razorpay_subscription_id).toBe('sub_2')
    // The update branch must not be able to move an existing row to another
    // user, whatever the caller passes.
    expect(call.update.user_id).toBeUndefined()
  })

  it('omits fields the caller did not supply rather than nulling them', async () => {
    // A confirm writes status and period; it must not wipe the customer id the
    // webhook already wrote, and vice versa.
    upsert.mockResolvedValue(row())
    await upsertSubscription(USER, {
      razorpaySubscriptionId: 'sub_2',
      razorpayPlanId: 'plan_1',
      status: 'active',
    })
    const call = upsert.mock.calls[0]?.[0]
    expect('razorpay_customer_id' in call.update).toBe(false)
    expect('current_start' in call.update).toBe(false)
  })

  it('writes an explicitly null field, because null is a real value here', async () => {
    upsert.mockResolvedValue(row())
    await upsertSubscription(USER, {
      razorpaySubscriptionId: 'sub_2',
      razorpayPlanId: 'plan_1',
      status: 'active',
      razorpayCustomerId: null,
    })
    const call = upsert.mock.calls[0]?.[0]
    expect(call.update.razorpay_customer_id).toBeNull()
  })
})

describe('applySubscriptionEvent', () => {
  const patch = {
    status: 'active' as const,
    currentStart: new Date('2026-09-17T00:00:00Z'),
    currentEnd: new Date('2026-10-17T00:00:00Z'),
    chargeAt: null,
    endedAt: null,
    razorpayCustomerId: 'cust_9',
    cancelAtCycleEnd: false,
    eventAt: new Date('2026-09-17T12:00:00Z'),
  }

  it('scopes on BOTH user_id and the razorpay subscription id', async () => {
    updateMany.mockResolvedValue({ count: 1 })
    await applySubscriptionEvent(USER, 'sub_1', patch)
    const where = updateMany.mock.calls[0]?.[0].where
    expect(where.user_id).toBe(USER)
    expect(where.razorpay_subscription_id).toBe('sub_1')
  })

  it('cannot be made to write another user by passing their subscription id', async () => {
    updateMany.mockResolvedValue({ count: 0 })
    const updated = await applySubscriptionEvent(OTHER_USER, 'sub_1', patch)
    expect(updateMany.mock.calls[0]?.[0].where.user_id).toBe(OTHER_USER)
    expect(updated).toBe(0)
  })

  it('refuses an event older than the last one seen, in the WHERE clause', async () => {
    updateMany.mockResolvedValue({ count: 0 })
    await applySubscriptionEvent(USER, 'sub_1', patch)
    const where = updateMany.mock.calls[0]?.[0].where
    // The guard must be part of the statement, not a read-then-write: two
    // deliveries can race, and a check in application code would let the older
    // one win whenever it lost the race to the read.
    expect(where.OR).toEqual([
      { last_event_at: null },
      { last_event_at: { lte: patch.eventAt } },
    ])
  })

  it('stores the event timestamp so the next delivery can be ordered against it', async () => {
    updateMany.mockResolvedValue({ count: 1 })
    await applySubscriptionEvent(USER, 'sub_1', patch)
    expect(updateMany.mock.calls[0]?.[0].data.last_event_at).toEqual(patch.eventAt)
  })

  it('writes every field of the patch', async () => {
    updateMany.mockResolvedValue({ count: 1 })
    await applySubscriptionEvent(USER, 'sub_1', patch)
    const data = updateMany.mock.calls[0]?.[0].data
    expect(data.status).toBe('active')
    expect(data.current_start).toEqual(patch.currentStart)
    expect(data.current_end).toEqual(patch.currentEnd)
    expect(data.charge_at).toBeNull()
    expect(data.ended_at).toBeNull()
    expect(data.razorpay_customer_id).toBe('cust_9')
    expect(data.cancel_at_cycle_end).toBe(false)
  })

  it('never writes user_id or the subscription id, which are what it scopes on', async () => {
    updateMany.mockResolvedValue({ count: 1 })
    await applySubscriptionEvent(USER, 'sub_1', patch)
    const data = updateMany.mock.calls[0]?.[0].data
    expect('user_id' in data).toBe(false)
    expect('razorpay_subscription_id' in data).toBe(false)
  })

  it('reports how many rows it actually changed', async () => {
    updateMany.mockResolvedValue({ count: 0 })
    expect(await applySubscriptionEvent(USER, 'sub_1', patch)).toBe(0)
    updateMany.mockResolvedValue({ count: 1 })
    expect(await applySubscriptionEvent(USER, 'sub_1', patch)).toBe(1)
  })
})
