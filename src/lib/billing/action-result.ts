/**
 * The result shapes the billing server actions return.
 *
 * Declared once here, in client-safe `src/lib`, so the `'use server'` module
 * and the two Client Components that call it share one definition instead of
 * four structural copies — the same reasoning as
 * `src/lib/strategy/action-result.ts`, and the same M2 mistake it was written
 * to stop.
 */
export type BillingActionResult = { ok: true } | { ok: false; message: string }

/**
 * What `startSubscription` hands the browser.
 *
 * `keyId` travels in the response rather than being published as a
 * `NEXT_PUBLIC_` variable: Razorpay Checkout needs it in the browser, but only
 * a signed-in user who has asked to pay ever receives it, instead of every
 * anonymous visitor downloading it in the bundle.
 */
export type StartSubscriptionResult =
  | { ok: true; subscriptionId: string; keyId: string }
  | { ok: false; message: string }
