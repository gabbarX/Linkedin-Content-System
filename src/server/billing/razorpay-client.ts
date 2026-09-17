import 'server-only'
import { z } from 'zod'
import { PLAN_TOTAL_COUNT } from '@/lib/billing/plan'
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '@/lib/billing/subscription'
import { getServerEnv } from '@/lib/env.server'

/**
 * The three Razorpay Subscriptions calls LinkBud makes, over plain `fetch`.
 *
 * No SDK. Razorpay's API is HTTP Basic auth over JSON and its signature checks
 * are HMAC-SHA256, which `node:crypto` already provides (see `signatures.ts`).
 * The official Node package would save roughly eighty lines of this file and
 * cost a runtime dependency plus its transitive tree, on a solo project where
 * CLAUDE.md treats every dependency as a lifetime maintenance cost.
 *
 * A factory rather than three free functions, so tests inject a fake `fetch`
 * and production reads the environment once at the call site. Nothing here
 * reads `process.env` at module scope — the app must keep building with no
 * credentials present.
 */

const API_BASE = 'https://api.razorpay.com/v1'

/**
 * A failed Razorpay call, carrying enough to act on and nothing that should not
 * be logged.
 *
 * The key secret is never part of the message. A test pins that, because an
 * error object is the single most likely thing to end up in a log aggregator.
 */
export class RazorpayError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'RazorpayError'
    this.status = status
    this.code = code
  }
}

/**
 * `z.enum(SUBSCRIPTION_STATUSES)` is what makes an undocumented status a parse
 * failure rather than a cast. If Razorpay ever adds a ninth state, this throws
 * with the offending value in the message instead of writing something the
 * database's check constraint would reject anyway — and much more importantly,
 * instead of being quietly narrowed to a type it is not.
 *
 * The nullable-and-optional fields are genuinely both: Razorpay returns
 * `customer_id: null` on a freshly created subscription and omits some period
 * fields entirely depending on the endpoint.
 */
const subscriptionSchema = z.object({
  id: z.string().min(1),
  plan_id: z.string().min(1),
  customer_id: z.string().nullable().optional(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  current_start: z.number().nullable().optional(),
  current_end: z.number().nullable().optional(),
  charge_at: z.number().nullable().optional(),
  ended_at: z.number().nullable().optional(),
  /**
   * When the subscription's **term** ends — `total_count` cycles after it
   * started, so ten years out for LinkBud's plan. Razorpay returns it on every
   * healthy subscription.
   *
   * It is **not** a cancellation signal, and reading it as one is a mistake
   * this codebase has already made: an earlier version derived
   * `cancelAtCycleEnd = end_at != null && status === 'active'`, which marked
   * every paying customer as cancelling. `/billing` told a customer who had
   * paid four minutes earlier that their access ended next month, and hid the
   * Cancel button. See the regression test in razorpay-client.test.ts.
   */
  end_at: z.number().nullable().optional(),
})

const errorSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    description: z.string().optional(),
  }),
})

export type RazorpaySubscription = {
  id: string
  status: SubscriptionStatus
  planId: string
  customerId: string | null
  currentStart: Date | null
  currentEnd: Date | null
  chargeAt: Date | null
  endedAt: Date | null
  /**
   * The end of the subscription's term — see the schema comment. Exposed
   * verbatim and interpreted nowhere.
   *
   * There is deliberately **no `cancelAtCycleEnd` here**, and this is measured
   * rather than assumed. `sub_TczLoX8CTzaF1b` was fetched on 2026-09-17 before
   * and after a real cancel-at-cycle-end, and the two responses are
   * indistinguishable: `status` `active` both times, `end_at` 2036-08-16 both
   * times, `has_scheduled_changes` `false` both times, `ended_at` null both
   * times. A fetched entity does not encode the fact anywhere.
   *
   * So it is not that an earlier version read the *wrong* field — there is no
   * right field. The fact is known in exactly two places: when LinkBud itself
   * calls `cancelAtCycleEnd()`, and when a `subscription.cancelled` webhook
   * names an entity that is still active. Both write it explicitly. Nothing
   * infers it, and this type gives nothing to infer it from.
   */
  endAt: Date | null
}

/** Razorpay speaks unix seconds; the rest of the app speaks `Date`. */
function secondsToDate(value: number | null | undefined): Date | null {
  return typeof value === 'number' ? new Date(value * 1000) : null
}

function toSubscription(parsed: z.infer<typeof subscriptionSchema>): RazorpaySubscription {
  return {
    id: parsed.id,
    status: parsed.status,
    planId: parsed.plan_id,
    customerId: parsed.customer_id ?? null,
    currentStart: secondsToDate(parsed.current_start),
    currentEnd: secondsToDate(parsed.current_end),
    chargeAt: secondsToDate(parsed.charge_at),
    endedAt: secondsToDate(parsed.ended_at),
    endAt: secondsToDate(parsed.end_at),
  }
}

export type RazorpayClient = {
  createSubscription(input: {
    planId: string
    notes: Record<string, string>
  }): Promise<RazorpaySubscription>
  fetchSubscription(id: string): Promise<RazorpaySubscription>
  cancelAtCycleEnd(id: string): Promise<RazorpaySubscription>
}

export function createRazorpayClient({
  keyId,
  keySecret,
  fetchImpl = fetch,
}: {
  keyId: string
  keySecret: string
  fetchImpl?: typeof fetch
}): RazorpayClient {
  const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`

  async function request(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
  ): Promise<RazorpaySubscription> {
    let response: Response
    try {
      response = await fetchImpl(`${API_BASE}${path}`, {
        method: init.method,
        headers: { authorization, 'content-type': 'application/json' },
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      })
    } catch (error) {
      // A DNS failure or a dropped connection. Status 0 says "never reached
      // Razorpay", which is a different fact from any HTTP status.
      throw new RazorpayError(
        `Razorpay request failed: ${error instanceof Error ? error.message : String(error)}`,
        0,
      )
    }

    // Read as text first: an edge gateway can answer a 502 with HTML, and
    // response.json() would throw a SyntaxError that says nothing useful.
    const text = await response.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new RazorpayError(
        `Razorpay returned a non-JSON response (HTTP ${response.status})`,
        response.status,
      )
    }

    if (!response.ok) {
      const parsedError = errorSchema.safeParse(json)
      const description = parsedError.success
        ? (parsedError.data.error.description ?? 'no description')
        : 'no description'
      const code = parsedError.success ? (parsedError.data.error.code ?? null) : null
      throw new RazorpayError(
        `Razorpay refused the request (HTTP ${response.status}): ${description}`,
        response.status,
        code,
      )
    }

    const parsed = subscriptionSchema.safeParse(json)
    if (!parsed.success) {
      throw new RazorpayError(
        `Razorpay returned a subscription this app cannot read: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
        response.status,
      )
    }
    return toSubscription(parsed.data)
  }

  /**
   * A crafted id must not be able to reach another endpoint. Razorpay ids are
   * opaque strings we hand back to Razorpay, and while they always arrive from
   * our own database, encoding is one line and the alternative is trusting
   * that fact forever. A test pins it.
   */
  const segment = (id: string) => encodeURIComponent(id)

  return {
    createSubscription: ({ planId, notes }) =>
      request('/subscriptions', {
        method: 'POST',
        body: {
          plan_id: planId,
          total_count: PLAN_TOTAL_COUNT,
          // Razorpay emails the customer itself unless told not to. LinkBud
          // owns its own transactional email, and two sets of billing mail
          // from two senders is worse than either alone.
          customer_notify: 0,
          notes,
        },
      }),

    fetchSubscription: (id) => request(`/subscriptions/${segment(id)}`, { method: 'GET' }),

    cancelAtCycleEnd: (id) =>
      request(`/subscriptions/${segment(id)}/cancel`, {
        method: 'POST',
        body: { cancel_at_cycle_end: 1 },
      }),
  }
}

/**
 * The client, the plan and the key id, built from the environment.
 *
 * Reads the environment inside the function body, never at module scope — the
 * app must keep building and prerendering with no credentials present.
 *
 * `keyId` comes back with the client because Razorpay Checkout needs it in the
 * browser. It is handed to a signed-in user who has asked to pay rather than
 * published as a `NEXT_PUBLIC_` variable in the bundle every visitor downloads.
 */
export function razorpayFromEnv(): { client: RazorpayClient; planId: string; keyId: string } {
  const env = getServerEnv()
  const missing = (
    [
      ['RAZORPAY_KEY', env.RAZORPAY_KEY],
      ['RAZORPAY_SECRET', env.RAZORPAY_SECRET],
      ['RAZORPAY_PLAN_ID', env.RAZORPAY_PLAN_ID],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new Error(`Razorpay is not configured: set ${missing.join(', ')}`)
  }

  // Narrowed by the check above, but TypeScript cannot see through the filter,
  // and CLAUDE.md bans `!`. Re-reading each value with an explicit guard costs
  // three lines and earns the narrowing instead of asserting it.
  const keyId = env.RAZORPAY_KEY
  const keySecret = env.RAZORPAY_SECRET
  const planId = env.RAZORPAY_PLAN_ID
  if (!keyId || !keySecret || !planId) {
    throw new Error('Razorpay is not configured')
  }

  return { client: createRazorpayClient({ keyId, keySecret }), planId, keyId }
}
