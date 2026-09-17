/**
 * The single SKU (spec §1.2): ₹1,499/month, no trial, card required before the
 * strategy is generated.
 *
 * Client-safe on purpose — the paywall screen renders the price and must not
 * pull a server module in to do it. Nothing here reads the environment: the
 * amount is a product decision, not configuration, and the Razorpay plan is
 * the thing that has to agree with it. `RAZORPAY_PLAN_ID`
 * (`plan_TcyWDCJsx4fnbQ`) is configured at 149900 paise, monthly, verified
 * live on 2026-09-17. If one changes, change both in the same commit.
 *
 * Razorpay works in the currency's smallest unit, so the amount is paise.
 * `formatPlanPrice` exists so that no component ever types the figure itself:
 * one place to change, and no chance of the button and the receipt disagreeing.
 */
export const PLAN_AMOUNT_PAISE = 149_900
export const PLAN_CURRENCY = 'INR'
export const PLAN_PERIOD = 'monthly'

/**
 * Total billing cycles requested when the subscription is created.
 *
 * Razorpay requires `total_count` and offers no "until cancelled" option, so
 * this is the longest sensible horizon: 120 monthly cycles is ten years, after
 * which the subscription reaches `completed` on its own. Needing to renew it
 * is a problem worth having.
 */
export const PLAN_TOTAL_COUNT = 120

/** "₹1,499" — no decimals, because the price has none. */
export function formatPlanPrice(): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: PLAN_CURRENCY,
    maximumFractionDigits: 0,
  }).format(PLAN_AMOUNT_PAISE / 100)
}

/** "₹1,499/month" — the phrase used on the paywall and in settings. */
export const PLAN_PRICE_LABEL = `${formatPlanPrice()}/month`
