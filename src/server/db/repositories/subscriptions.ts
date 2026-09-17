import 'server-only'
import { isSubscriptionStatus, type SubscriptionStatus } from '@/lib/billing/subscription'
import { getPrisma } from '../client'

/**
 * Subscription data access (spec §5).
 *
 * Prisma bypasses row-level security, so nothing in the database stops a query
 * here from returning another customer's row. **Every exported function takes
 * userId as its first argument and scopes on it.** That convention is the
 * authorization model.
 *
 * `subscriptions` is also the one table with no insert/update/delete RLS
 * policy at all (see `supabase/migrations/0005_billing.sql`), so this module is
 * the only way a row is ever written. A user may read their own billing state
 * over the Data API and may not write it.
 *
 * ## The webhook and the userId-first rule
 *
 * A webhook has no session, so the obvious implementation would look a row up
 * by `razorpay_subscription_id` alone — a query that does not scope by userId,
 * which CLAUDE.md makes a stop-and-ask. That is avoided rather than excused.
 *
 * The subscription is created with `notes: { user_id }`, Razorpay echoes
 * `notes` back on every event, and the payload's signature is verified before
 * anything reads it. So `applySubscriptionEvent` takes the userId from the
 * signed payload and scopes on **both** columns. A payload naming a
 * subscription that belongs to someone else updates zero rows, which the
 * caller logs. The convention holds with no exception carved out of it.
 */

export type Subscription = {
  userId: string
  razorpaySubscriptionId: string
  razorpayPlanId: string
  /** Null until Razorpay assigns a customer, which happens at authorisation. */
  razorpayCustomerId: string | null
  status: SubscriptionStatus
  /** Null until the first charge. */
  currentStart: Date | null
  currentEnd: Date | null
  chargeAt: Date | null
  cancelAtCycleEnd: boolean
  endedAt: Date | null
  /** The timestamp of the most recent webhook applied. The ordering guard. */
  lastEventAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type SubscriptionRow = {
  user_id: string
  razorpay_subscription_id: string
  razorpay_plan_id: string
  razorpay_customer_id: string | null
  status: string
  current_start: Date | null
  current_end: Date | null
  charge_at: Date | null
  cancel_at_cycle_end: boolean
  ended_at: Date | null
  last_event_at: Date | null
  created_at: Date
  updated_at: Date
}

/**
 * The database columns are snake_case and `status` is `text` with a check
 * constraint that Prisma's types do not model. This is the single place that
 * translates, so callers never see either.
 *
 * A status outside the eight throws rather than being coerced. It means the
 * database and the code have diverged, and either coercion is wrong: treating
 * it as entitled gives the product away, and treating it as unentitled locks
 * out a paying customer over a deploy-order mistake. Failing loudly is the
 * only honest option. No cast — `isSubscriptionStatus` narrows.
 */
function toSubscription(row: SubscriptionRow): Subscription {
  if (!isSubscriptionStatus(row.status)) {
    throw new Error(
      `subscriptions.status holds ${JSON.stringify(row.status)} for user ${row.user_id}, ` +
        'which is not one of the eight Razorpay subscription states',
    )
  }
  return {
    userId: row.user_id,
    razorpaySubscriptionId: row.razorpay_subscription_id,
    razorpayPlanId: row.razorpay_plan_id,
    razorpayCustomerId: row.razorpay_customer_id,
    status: row.status,
    currentStart: row.current_start,
    currentEnd: row.current_end,
    chargeAt: row.charge_at,
    cancelAtCycleEnd: row.cancel_at_cycle_end,
    endedAt: row.ended_at,
    lastEventAt: row.last_event_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** The signed-in user's subscription, or null if they have never subscribed. */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  const row = await getPrisma().subscriptions.findUnique({ where: { user_id: userId } })
  return row ? toSubscription(row) : null
}

/**
 * Everything a caller may set. The two required fields identify the Razorpay
 * subscription; the rest are optional so a partial write does not wipe a field
 * another path already filled in — a confirm writes status and period and must
 * not clear the customer id the webhook wrote, and vice versa.
 *
 * `null` is a real value, distinct from omitted: `razorpayCustomerId: null`
 * clears the column, `razorpayCustomerId` absent leaves it alone.
 */
export type SubscriptionUpsert = {
  razorpaySubscriptionId: string
  razorpayPlanId: string
  status: SubscriptionStatus
  razorpayCustomerId?: string | null
  currentStart?: Date | null
  currentEnd?: Date | null
  chargeAt?: Date | null
  cancelAtCycleEnd?: boolean
  endedAt?: Date | null
  lastEventAt?: Date | null
}

/**
 * The columns an upsert writes, built once and shared by both branches so
 * create and update cannot drift apart — the M2 review pattern of a rule
 * applied in one place and forgotten in the next.
 *
 * `user_id` is deliberately absent: it is added to `create` only, so an update
 * can never move an existing row to a different user however it is called.
 */
function upsertColumns(input: SubscriptionUpsert) {
  return {
    razorpay_subscription_id: input.razorpaySubscriptionId,
    razorpay_plan_id: input.razorpayPlanId,
    status: input.status,
    ...(input.razorpayCustomerId !== undefined && {
      razorpay_customer_id: input.razorpayCustomerId,
    }),
    ...(input.currentStart !== undefined && { current_start: input.currentStart }),
    ...(input.currentEnd !== undefined && { current_end: input.currentEnd }),
    ...(input.chargeAt !== undefined && { charge_at: input.chargeAt }),
    ...(input.cancelAtCycleEnd !== undefined && { cancel_at_cycle_end: input.cancelAtCycleEnd }),
    ...(input.endedAt !== undefined && { ended_at: input.endedAt }),
    ...(input.lastEventAt !== undefined && { last_event_at: input.lastEventAt }),
  }
}

/**
 * Create or replace the user's subscription row.
 *
 * One row per user (spec §1.1), so resubscribing after a cancellation writes a
 * new Razorpay subscription id onto the same row. Razorpay cannot restart a
 * cancelled subscription and v1 keeps no billing history — Razorpay's own
 * dashboard is the system of record for that.
 */
export async function upsertSubscription(
  userId: string,
  input: SubscriptionUpsert,
): Promise<Subscription> {
  const columns = upsertColumns(input)
  const row = await getPrisma().subscriptions.upsert({
    where: { user_id: userId },
    create: { user_id: userId, ...columns },
    update: columns,
  })
  return toSubscription(row)
}

/**
 * The write a verified webhook implies. Every field is required — a webhook
 * carries the whole entity, so there is nothing to leave alone.
 */
export type SubscriptionEventPatch = {
  status: SubscriptionStatus
  currentStart: Date | null
  currentEnd: Date | null
  chargeAt: Date | null
  endedAt: Date | null
  razorpayCustomerId: string | null
  cancelAtCycleEnd: boolean
  /** The event's own timestamp, not now(). This is what orders deliveries. */
  eventAt: Date
}

/**
 * Apply a verified webhook, returning the number of rows changed.
 *
 * Zero is not an error — it means either that the event is older than one
 * already applied (the ordering guard did its job) or that no row matches that
 * user and subscription. The caller logs it and answers 200 either way, because
 * Razorpay retries anything that is not 2xx and neither case is fixable by
 * retrying.
 *
 * The staleness comparison is in the WHERE clause rather than a read followed
 * by a write: two deliveries can race, and a check in application code would
 * let the older one win whenever it lost the race to the read.
 *
 * `user_id` and `razorpay_subscription_id` are never in `data` — they are what
 * this statement scopes on, and a write that could change its own scope is not
 * a scope.
 */
export async function applySubscriptionEvent(
  userId: string,
  razorpaySubscriptionId: string,
  patch: SubscriptionEventPatch,
): Promise<number> {
  const result = await getPrisma().subscriptions.updateMany({
    where: {
      user_id: userId,
      razorpay_subscription_id: razorpaySubscriptionId,
      OR: [{ last_event_at: null }, { last_event_at: { lte: patch.eventAt } }],
    },
    data: {
      status: patch.status,
      current_start: patch.currentStart,
      current_end: patch.currentEnd,
      charge_at: patch.chargeAt,
      ended_at: patch.endedAt,
      razorpay_customer_id: patch.razorpayCustomerId,
      cancel_at_cycle_end: patch.cancelAtCycleEnd,
      last_event_at: patch.eventAt,
    },
  })
  return result.count
}
