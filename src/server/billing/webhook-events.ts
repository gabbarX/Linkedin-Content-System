import { z } from 'zod'
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '@/lib/billing/subscription'
import type { SubscriptionEventPatch } from '@/server/db/repositories/subscriptions'

/**
 * Turn a verified Razorpay webhook body into the write it implies, or null.
 *
 * Pure: no I/O, no crypto, no database. The route calls this only after the
 * signature has been checked, so the payload is trusted input by the time it
 * arrives — including `notes.user_id`, which is what lets the write stay scoped
 * to a user (see `src/server/db/repositories/subscriptions.ts`).
 *
 * No `server-only` guard, deliberately: nothing here touches a secret or a
 * connection, and the module is easier to test without one. It is still only
 * imported from the route.
 *
 * **`null` means "nothing to do", not "something went wrong".** Razorpay sends
 * payment and invoice events to the same endpoint and retries anything not
 * answered with a 2xx, so an event we do not act on must be accepted quietly
 * rather than retried forever. A malformed body returns `null` for the same
 * reason — it is signed, so it came from Razorpay, and no number of retries
 * will make it parseable.
 *
 * **The status comes from the entity, never from the event name.** The two
 * disagree in a case that matters: a cancellation scheduled for the end of the
 * cycle arrives as `subscription.cancelled` while the entity is still `active`,
 * because the customer has paid for the rest of the period. Deriving the status
 * from the name would lock out a paying customer three weeks early. A test pins
 * this.
 */

const entitySchema = z.object({
  id: z.string().min(1),
  status: z.enum(SUBSCRIPTION_STATUSES),
  customer_id: z.string().nullable().optional(),
  current_start: z.number().nullable().optional(),
  current_end: z.number().nullable().optional(),
  charge_at: z.number().nullable().optional(),
  ended_at: z.number().nullable().optional(),
  /**
   * The end of the subscription's TERM — ten years out for LinkBud's plan —
   * not a cancellation. Parsed so the schema matches what actually arrives, and
   * read nowhere. See `razorpay-client.ts` for the bug that reading it caused.
   */
  end_at: z.number().nullable().optional(),
  notes: z.record(z.string(), z.unknown()).optional(),
})

const eventSchema = z.object({
  event: z.string().min(1),
  /** The event's own timestamp, in unix seconds. This is what orders deliveries. */
  created_at: z.number(),
  payload: z.object({
    subscription: z.object({ entity: entitySchema }),
  }),
})

function secondsToDate(value: number | null | undefined): Date | null {
  return typeof value === 'number' ? new Date(value * 1000) : null
}

/**
 * Whether this event establishes anything about a scheduled cancellation.
 *
 * Exactly one event does. `subscription.cancelled` naming an entity that is
 * still `active` is Razorpay saying "cancellation accepted, and the customer
 * keeps the cycle they have paid for" — the event name and the entity status
 * disagree, and that disagreement *is* the signal. The same event naming an
 * entity that has reached `cancelled` means it is simply over, and the flag no
 * longer describes anything.
 *
 * Every other event returns `{}`, so `applySubscriptionEvent` leaves the column
 * alone. Writing `false` from a `subscription.charged` that arrived after a
 * scheduled cancellation would silently un-cancel it in our copy, and
 * `/billing` would offer to cancel something already cancelled.
 *
 * This deliberately does **not** look at `end_at`. That field is the end of the
 * subscription's ten-year term and is present on every healthy subscription; an
 * earlier version read it as a cancellation and told every paying customer that
 * their access ended next month.
 */
function cancellationFrom(
  event: string,
  status: SubscriptionStatus,
): { cancelAtCycleEnd?: boolean } {
  if (event !== 'subscription.cancelled') return {}
  return { cancelAtCycleEnd: status === 'active' }
}

export type WebhookApply = {
  userId: string
  razorpaySubscriptionId: string
  patch: SubscriptionEventPatch
}

export function readWebhookEvent(body: unknown): WebhookApply | null {
  const parsed = eventSchema.safeParse(body)
  // Covers a body that is not an object, a payment event (whose payload has no
  // `subscription` key) and a subscription event carrying a status Razorpay
  // does not document — all of which are "nothing to do", not an error.
  if (!parsed.success) return null

  if (!parsed.data.event.startsWith('subscription.')) return null

  const entity = parsed.data.payload.subscription.entity

  // Without a user id there is nothing to scope the write on, and looking the
  // row up by subscription id alone would be the unscoped query the repository
  // exists to avoid. Dropping the event is the correct outcome: it can only
  // happen for a subscription LinkBud did not create.
  const userId = entity.notes?.user_id
  if (typeof userId !== 'string' || userId.length === 0) return null

  return {
    userId,
    razorpaySubscriptionId: entity.id,
    patch: {
      status: entity.status,
      currentStart: secondsToDate(entity.current_start),
      currentEnd: secondsToDate(entity.current_end),
      chargeAt: secondsToDate(entity.charge_at),
      endedAt: secondsToDate(entity.ended_at),
      razorpayCustomerId: entity.customer_id ?? null,
      ...cancellationFrom(parsed.data.event, entity.status),
      eventAt: new Date(parsed.data.created_at * 1000),
    },
  }
}
