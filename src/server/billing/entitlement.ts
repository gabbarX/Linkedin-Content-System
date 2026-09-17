import 'server-only'
import { redirect } from 'next/navigation'
import { isEntitled } from '@/lib/billing/subscription'
import { getSubscription, type Subscription } from '@/server/db/repositories/subscriptions'

/**
 * The one place that answers "may this user use the product right now".
 *
 * It is called from three enforcement points, and it has to be all three:
 *
 *   1. `(app)/(onboarded)/layout.tsx` — the dashboard, calendar and strategy
 *      pages.
 *   2. `/onboarding/strategy` — which lives **outside** that route group, so
 *      the layout guard cannot cover it.
 *   3. `buildStrategy()` and `briefUpcomingWeek()` — because a server action is
 *      a public HTTP endpoint. A page redirect constrains a cooperative
 *      browser; a crafted POST skips it entirely, and what it would skip past
 *      is six model calls billed to us.
 *
 * Milestone 2 lost four review rounds to guards applied at some of the places
 * and not the rest. Three call sites, one function, no second copy of the rule.
 *
 * Entitlement is recomputed on every request from the stored status. It is
 * never cached on the profile, in a cookie or in a session: a cached yes is one
 * missed webhook away from being wrong in the direction that gives the product
 * away.
 */

/**
 * Whether this subscription grants access. Pure, so it can be tested without a
 * database or a request.
 *
 * Deliberately reads **only** the status. It must not start comparing
 * `currentEnd` against the clock: Razorpay owns the billing cycle, our clock
 * can skew, and a date comparison here would lock out a paying customer over a
 * few seconds of drift. A test pins that a stale `currentEnd` on an `active`
 * subscription still grants access.
 */
export function entitlementFor(subscription: Subscription | null): boolean {
  return isEntitled(subscription?.status ?? null)
}

export type Entitlement = {
  entitled: boolean
  subscription: Subscription | null
}

/**
 * The user's entitlement and the subscription it was derived from — the
 * subscription comes back too so `/billing` can render the status without a
 * second query.
 */
export async function loadEntitlement(userId: string): Promise<Entitlement> {
  const subscription = await getSubscription(userId)
  return { entitled: entitlementFor(subscription), subscription }
}

/**
 * Send an unentitled user to `/billing`, which is the page that fixes it.
 *
 * `/billing` sits under `(app)` but **outside** the `(onboarded)` route group,
 * so it never renders through the guard that calls this — the redirect loop is
 * structurally impossible rather than avoided by comparing paths. Same
 * reasoning as Ruling R8.
 *
 * `redirect()` works by throwing Next's navigation signal, so this must never
 * be called inside a `try` that swallows what it throws.
 */
export async function requireEntitled(userId: string): Promise<void> {
  const { entitled } = await loadEntitlement(userId)
  if (!entitled) redirect('/billing')
}
