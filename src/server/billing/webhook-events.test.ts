import { describe, expect, it } from 'vitest'
import { readWebhookEvent } from './webhook-events'

const SUBSCRIPTION_EVENTS = [
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.completed',
  'subscription.updated',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.paused',
  'subscription.resumed',
] as const

function event(name: string, entity: Record<string, unknown> = {}) {
  return {
    entity: 'event',
    event: name,
    created_at: 1758110400,
    payload: {
      subscription: {
        entity: {
          id: 'sub_1',
          plan_id: 'plan_1',
          customer_id: 'cust_1',
          status: 'active',
          current_start: 1758067200,
          current_end: 1760745600,
          charge_at: 1760745600,
          ended_at: null,
          notes: { user_id: 'u1' },
          ...entity,
        },
      },
    },
  }
}

describe('readWebhookEvent', () => {
  it.each(SUBSCRIPTION_EVENTS)('reads %s', (name) => {
    const read = readWebhookEvent(event(name))
    expect(read).not.toBeNull()
    expect(read?.userId).toBe('u1')
    expect(read?.razorpaySubscriptionId).toBe('sub_1')
  })

  it('takes the status from the entity, not from the event name', () => {
    // subscription.charged arrives with status active, and
    // subscription.cancelled arrives with status active when the cancellation
    // is scheduled for the end of the cycle. Deriving status from the name
    // would lock out a customer who cancelled but has three weeks left.
    const read = readWebhookEvent(event('subscription.cancelled', { status: 'active' }))
    expect(read?.patch.status).toBe('active')
  })

  it('carries the event timestamp so deliveries can be ordered', () => {
    expect(readWebhookEvent(event('subscription.activated'))?.patch.eventAt).toEqual(
      new Date(1758110400 * 1000),
    )
  })

  it('converts every unix second field to a Date, and null to null', () => {
    const read = readWebhookEvent(event('subscription.activated', { ended_at: 1760745600 }))
    expect(read?.patch.currentStart).toEqual(new Date(1758067200 * 1000))
    expect(read?.patch.currentEnd).toEqual(new Date(1760745600 * 1000))
    expect(read?.patch.chargeAt).toEqual(new Date(1760745600 * 1000))
    expect(read?.patch.endedAt).toEqual(new Date(1760745600 * 1000))

    const empty = readWebhookEvent(
      event('subscription.pending', {
        current_start: null,
        current_end: null,
        charge_at: null,
        status: 'pending',
      }),
    )
    expect(empty?.patch.currentStart).toBeNull()
    expect(empty?.patch.currentEnd).toBeNull()
    expect(empty?.patch.chargeAt).toBeNull()
  })

  it('reads the customer id, and null when Razorpay has not assigned one', () => {
    expect(readWebhookEvent(event('subscription.activated'))?.patch.razorpayCustomerId).toBe('cust_1')
    expect(
      readWebhookEvent(event('subscription.authenticated', { customer_id: null }))?.patch
        .razorpayCustomerId,
    ).toBeNull()
  })

  it('treats end_at on an active subscription as a scheduled cancellation', () => {
    expect(
      readWebhookEvent(event('subscription.cancelled', { status: 'active', end_at: 1760745600 }))
        ?.patch.cancelAtCycleEnd,
    ).toBe(true)
    expect(readWebhookEvent(event('subscription.activated'))?.patch.cancelAtCycleEnd).toBe(false)
  })

  it('does not call an already-cancelled subscription scheduled-for-cancellation', () => {
    // Once status is genuinely cancelled the cycle is over, so end_at is
    // history rather than a pending change. Reporting it as scheduled would
    // make /billing offer to keep a subscription that has already ended.
    expect(
      readWebhookEvent(event('subscription.cancelled', { status: 'cancelled', end_at: 1760745600 }))
        ?.patch.cancelAtCycleEnd,
    ).toBe(false)
  })

  it.each([['payment.captured'], ['payment.failed'], ['order.paid'], ['invoice.paid']])(
    'ignores the unrelated event %s',
    (name) => {
      expect(readWebhookEvent(event(name))).toBeNull()
    },
  )

  it('ignores an event whose notes carry no usable user_id', () => {
    // Without it there is nothing to scope the write on, and looking the row up
    // by subscription id alone would be an unscoped query.
    expect(readWebhookEvent(event('subscription.activated', { notes: {} }))).toBeNull()
    expect(readWebhookEvent(event('subscription.activated', { notes: { user_id: 42 } }))).toBeNull()
    expect(readWebhookEvent(event('subscription.activated', { notes: { user_id: '' } }))).toBeNull()
  })

  it('ignores an event carrying a status Razorpay does not document', () => {
    expect(readWebhookEvent(event('subscription.activated', { status: 'trialing' }))).toBeNull()
  })

  it.each([
    [null],
    [undefined],
    ['a string'],
    [42],
    [{}],
    [{ event: 'subscription.activated' }],
    [{ event: 'subscription.activated', created_at: 1, payload: {} }],
  ])('returns null for the malformed body %o rather than throwing', (body) => {
    expect(readWebhookEvent(body)).toBeNull()
  })

  it('returns null rather than throwing when payload.subscription is missing', () => {
    expect(
      readWebhookEvent({
        entity: 'event',
        event: 'subscription.charged',
        created_at: 1758110400,
        payload: { payment: { entity: { id: 'pay_1' } } },
      }),
    ).toBeNull()
  })
})
