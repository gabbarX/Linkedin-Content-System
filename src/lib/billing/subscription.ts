/**
 * Razorpay's subscription state vocabulary, and what LinkBud does with it.
 *
 * Client-safe, and it must stay that way: `/billing` renders these labels from
 * a Client Component, and a `server-only` import anywhere in that dependency
 * chain fails the build with an error pointing at the wrong file. Same
 * reasoning as `src/lib/onboarding/steps.ts` (Ruling R9). Import nothing from
 * `@/server/**` here.
 *
 * The eight values are Razorpay's own, not a LinkBud translation of them, and
 * must stay in step with the check constraint in
 * `supabase/migrations/0005_billing.sql`. Storing the provider's vocabulary
 * means there is no mapping layer that can silently fall through — and an
 * unmapped state would read as "no subscription", which fails open into free
 * access.
 */
export const SUBSCRIPTION_STATUSES = [
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'cancelled',
  'completed',
  'expired',
] as const

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/**
 * The states that grant access to the product.
 *
 * `active` is the steady state. `authenticated` counts too: the mandate is
 * signed and the authorisation transaction has gone through, and the flip to
 * `active` happens when Razorpay starts the billing cycle. Making someone who
 * has just paid wait on a webhook before they can use what they paid for is a
 * support ticket, not a safeguard.
 *
 * Everything else is deliberately out, including `cancelled`: a cancellation
 * scheduled for the end of the cycle leaves the subscription `active` until
 * that moment, so a row that has actually reached `cancelled` is over.
 *
 * `satisfies` rather than a type annotation, so the array keeps its literal
 * tuple type AND is checked against SubscriptionStatus — a typo here is a
 * compile error rather than a string that silently never matches.
 */
const ENTITLED_STATUSES = [
  'authenticated',
  'active',
] as const satisfies readonly SubscriptionStatus[]

/**
 * Whether a user with this status may use the product. `null` means the user
 * has no subscription row at all.
 */
export function isEntitled(status: SubscriptionStatus | null): boolean {
  return status !== null && ENTITLED_STATUSES.some((entitled) => entitled === status)
}

/**
 * Narrow an unknown value — a database column, a webhook payload — to a status.
 *
 * `.some(s => s === value)` rather than
 * `(SUBSCRIPTION_STATUSES as readonly string[]).includes(value)`: the cast
 * version asserts the fact instead of earning it, and CLAUDE.md bans it for
 * the same reason it bans `!`. The `.some` form narrows identically.
 */
export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === 'string' && SUBSCRIPTION_STATUSES.some((status) => status === value)
}

export type StatusTone = 'good' | 'warn' | 'ended'

export type StatusDescription = {
  /** The heading on /billing. */
  label: string
  /** One sentence saying what it means and what, if anything, to do about it. */
  detail: string
  /**
   * `good` is exactly the set of statuses that grant access — a test pins
   * that. If the panel ever said "good" to someone the guard turns away, the
   * page would be telling them they are fine while the product refuses them,
   * which is the most confusing failure this screen can have.
   */
  tone: StatusTone
}

/**
 * What to tell the user, per status.
 *
 * An exhaustive switch with no `default` branch, deliberately: adding a status
 * to SUBSCRIPTION_STATUSES without writing its copy is then a compile error,
 * rather than an empty panel on a paying customer's billing page.
 *
 * The copy never names a status value or a milestone. The user did not choose
 * this vocabulary and should not have to learn it.
 */
export function describeStatus(status: SubscriptionStatus): StatusDescription {
  switch (status) {
    case 'created':
      return {
        label: 'Not started yet',
        detail:
          'Your subscription was set up but the payment was never completed. Starting again is safe — you will not be charged twice.',
        tone: 'warn',
      }
    case 'authenticated':
      return {
        label: 'Starting',
        detail:
          'Your payment method is authorised and the first billing cycle is about to begin. Everything is unlocked.',
        tone: 'good',
      }
    case 'active':
      return {
        label: 'Active',
        detail: 'Everything is running.',
        tone: 'good',
      }
    case 'pending':
      return {
        label: 'Payment failed',
        detail:
          'A charge did not go through and your bank is being retried. Checking the card or mandate on your bank side usually fixes it.',
        tone: 'warn',
      }
    case 'halted':
      return {
        label: 'Payment stopped',
        detail:
          'Every retry failed, so billing has stopped. Start a new subscription to pick up exactly where you left off.',
        tone: 'warn',
      }
    case 'cancelled':
      return {
        label: 'Cancelled',
        detail:
          'This subscription has ended. Your strategy, voice profile and business profile are untouched — subscribe again to use them.',
        tone: 'ended',
      }
    case 'completed':
      return {
        label: 'Completed',
        detail: 'This subscription reached the end of its term. Start a new one to continue.',
        tone: 'ended',
      }
    case 'expired':
      return {
        label: 'Expired',
        detail:
          'The payment was not authorised in time, so this subscription lapsed before it began. Starting again is safe.',
        tone: 'ended',
      }
  }
}
