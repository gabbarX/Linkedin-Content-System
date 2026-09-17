import { describe, expect, it, vi } from 'vitest'
import { RazorpayError, createRazorpayClient } from './razorpay-client'

const SUBSCRIPTION_JSON = {
  id: 'sub_1',
  entity: 'subscription',
  plan_id: 'plan_1',
  customer_id: 'cust_1',
  status: 'active',
  current_start: 1758067200,
  current_end: 1760745600,
  charge_at: 1760745600,
  ended_at: null,
  total_count: 120,
  paid_count: 1,
  short_url: 'https://rzp.io/rzp/abc',
  notes: { user_id: 'u1' },
}

/**
 * The parameters are declared even though the body ignores them: without them
 * `mock.calls` is typed as an empty tuple and every `calls[0]?.[1]` below is a
 * type error rather than the assertion it reads as.
 */
function fakeFetch(body: unknown, init: { status?: number } = {}) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
  )
}

function client(fetchImpl: typeof fetch) {
  return createRazorpayClient({ keyId: 'rzp_test_k', keySecret: 's3cret', fetchImpl })
}

describe('createSubscription', () => {
  it('POSTs to the subscriptions endpoint with Basic auth and the plan', async () => {
    const fetchImpl = fakeFetch(SUBSCRIPTION_JSON)
    await client(fetchImpl).createSubscription({ planId: 'plan_1', notes: { user_id: 'u1' } })

    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions')
    expect(init?.method).toBe('POST')

    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe(
      `Basic ${Buffer.from('rzp_test_k:s3cret').toString('base64')}`,
    )
    expect(headers.get('content-type')).toBe('application/json')

    const sent = JSON.parse(String(init?.body))
    expect(sent.plan_id).toBe('plan_1')
    expect(sent.total_count).toBe(120)
    expect(sent.notes).toEqual({ user_id: 'u1' })
    // Razorpay emails the customer itself unless told not to. LinkBud owns its
    // own transactional email (Resend), and two sets of billing mail from two
    // senders is worse than either alone.
    expect(sent.customer_notify).toBe(0)
  })

  it('maps the response onto Date objects and a narrowed status', async () => {
    const subscription = await client(fakeFetch(SUBSCRIPTION_JSON)).createSubscription({
      planId: 'plan_1',
      notes: {},
    })
    expect(subscription.id).toBe('sub_1')
    expect(subscription.status).toBe('active')
    expect(subscription.planId).toBe('plan_1')
    expect(subscription.customerId).toBe('cust_1')
    expect(subscription.currentStart).toEqual(new Date(1758067200 * 1000))
    expect(subscription.currentEnd).toEqual(new Date(1760745600 * 1000))
    expect(subscription.chargeAt).toEqual(new Date(1760745600 * 1000))
    expect(subscription.endedAt).toBeNull()
  })

  it('treats a not-yet-assigned customer and period as null rather than failing', async () => {
    // This is the shape of a freshly created subscription: no customer until
    // the authorisation transaction, no period until the first charge.
    const subscription = await client(
      fakeFetch({
        ...SUBSCRIPTION_JSON,
        customer_id: null,
        current_start: null,
        current_end: null,
        charge_at: null,
        status: 'created',
      }),
    ).createSubscription({ planId: 'plan_1', notes: {} })
    expect(subscription.customerId).toBeNull()
    expect(subscription.currentStart).toBeNull()
    expect(subscription.chargeAt).toBeNull()
    expect(subscription.status).toBe('created')
  })

  it('treats an absent customer_id key the same as an explicit null', async () => {
    const { customer_id: _dropped, ...withoutCustomer } = SUBSCRIPTION_JSON
    const subscription = await client(fakeFetch(withoutCustomer)).createSubscription({
      planId: 'plan_1',
      notes: {},
    })
    expect(subscription.customerId).toBeNull()
  })
})

describe('error handling', () => {
  it('raises RazorpayError carrying the HTTP status and Razorpay error code', async () => {
    const fetchImpl = fakeFetch(
      {
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'plan_id is not a valid id',
          reason: 'input_validation_failed',
        },
      },
      { status: 400 },
    )
    const thrown = await client(fetchImpl)
      .createSubscription({ planId: 'nope', notes: {} })
      .catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(RazorpayError)
    expect(thrown).toMatchObject({ status: 400, code: 'BAD_REQUEST_ERROR' })
    expect(String(thrown)).toContain('plan_id is not a valid id')
  })

  it('does not leak the key secret into the error message', async () => {
    // An error object is the single most likely thing to reach a log
    // aggregator, so this is pinned rather than assumed.
    const fetchImpl = fakeFetch({ error: { code: 'SERVER_ERROR', description: 'boom' } }, { status: 500 })
    const thrown = await client(fetchImpl)
      .fetchSubscription('sub_1')
      .catch((error: unknown) => error)
    expect(String(thrown)).not.toContain('s3cret')
    expect(JSON.stringify(thrown)).not.toContain('s3cret')
  })

  it('raises RazorpayError rather than a parse error when the body is not JSON', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('<html>gateway timeout</html>', { status: 504 }),
    )
    const thrown = await client(fetchImpl)
      .fetchSubscription('sub_1')
      .catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(RazorpayError)
    expect(thrown).toMatchObject({ status: 504 })
  })

  it('raises RazorpayError when a 200 body is missing required fields', async () => {
    const thrown = await client(fakeFetch({ id: 'sub_1' }))
      .fetchSubscription('sub_1')
      .catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(RazorpayError)
  })

  it('raises RazorpayError when the status is not one Razorpay documents', async () => {
    const thrown = await client(fakeFetch({ ...SUBSCRIPTION_JSON, status: 'trialing' }))
      .fetchSubscription('sub_1')
      .catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(RazorpayError)
  })

  it('raises RazorpayError when fetch itself rejects', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new TypeError('network down')
    })
    const thrown = await client(fetchImpl)
      .fetchSubscription('sub_1')
      .catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(RazorpayError)
    expect(String(thrown)).toContain('network down')
  })
})

describe('fetchSubscription and cancelAtCycleEnd', () => {
  it('GETs the subscription by id', async () => {
    const fetchImpl = fakeFetch(SUBSCRIPTION_JSON)
    await client(fetchImpl).fetchSubscription('sub_1')
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions/sub_1')
    expect(init?.method).toBe('GET')
  })

  it('POSTs cancel_at_cycle_end so the user keeps the cycle they paid for', async () => {
    const fetchImpl = fakeFetch(SUBSCRIPTION_JSON)
    await client(fetchImpl).cancelAtCycleEnd('sub_1')
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions/sub_1/cancel')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ cancel_at_cycle_end: 1 })
  })

  it('percent-encodes an id so a crafted one cannot reach another path', async () => {
    const fetchImpl = fakeFetch(SUBSCRIPTION_JSON)
    await client(fetchImpl).fetchSubscription('sub_1/../../payments')
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.razorpay.com/v1/subscriptions/sub_1%2F..%2F..%2Fpayments',
    )
  })
})
