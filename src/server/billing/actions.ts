'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { BillingActionResult, StartSubscriptionResult } from '@/lib/billing/action-result'
import { nextStep, routeForStep } from '@/lib/onboarding/steps'
import { getServerEnv } from '@/lib/env.server'
import { createServerClient } from '@/lib/supabase/server'
import { getProfile, updateProfile } from '@/server/db/repositories/profiles'
import { getSubscription, upsertSubscription } from '@/server/db/repositories/subscriptions'
import { entitlementFor, loadEntitlement } from './entitlement'
import { razorpayFromEnv } from './razorpay-client'
import { checkoutSignatureIsValid } from './signatures'

/**
 * The billing module's server actions (spec §1.2).
 *
 * Every export re-derives the signed-in user from the session rather than
 * trusting anything the client sent — Prisma bypasses RLS, so a `userId`
 * argument would be a cross-customer hole (CLAUDE.md). None of these takes a
 * user argument at all.
 *
 * ## The browser is never believed
 *
 * `confirmSubscription` is the one action that takes input from the page, and
 * it treats that input as a claim rather than a fact. Three things must hold
 * before a subscription is recorded as paid:
 *
 *   1. The checkout signature verifies against our key secret — the message was
 *      not forged.
 *   2. The subscription id matches the row **this user** already owns — a
 *      signature genuinely issued for someone else's subscription cannot
 *      activate this account.
 *   3. Razorpay's own answer, re-fetched server to server, is what gets stored
 *      — the signature proves the message is authentic, and only the re-fetch
 *      proves what Razorpay actually thinks is true.
 *
 * The webhook is a fourth, independent path to the same fact, so a browser that
 * dies immediately after payment still ends up with an activated account.
 */

/** `Error.message`/`.name` are non-enumerable, so logging the error object
 * itself serialises to `{}` — same reasoning as the strategy actions. */
function describeErrorForLog(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function requireUserId(): Promise<string> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return user.id
}

/**
 * Deliberately vague, and the same for every failure a stranger could
 * provoke. A caller who has just forged a signature learns nothing from it;
 * the specific cause is in the server log, where it belongs.
 */
const GENERIC_FAILURE =
  'We could not confirm that payment. If money left your account, it will be recorded within a few minutes — reload this page before trying again.'

/**
 * Create a Razorpay subscription and hand the browser what Checkout needs.
 *
 * The row is written **before** this returns, with whatever status Razorpay
 * reports (`created`). That is what makes the webhook able to find it: if the
 * browser dies between here and the handler, the subscription still exists on
 * both sides and `subscription.activated` lands on a real row.
 */
export async function startSubscription(): Promise<StartSubscriptionResult> {
  const userId = await requireUserId()

  // A stale tab, or a double tap. Creating a second subscription would mean a
  // second mandate and, eventually, two charges.
  const { entitled } = await loadEntitlement(userId)
  if (entitled) {
    return { ok: false, message: 'You already have an active subscription.' }
  }

  try {
    const { client, planId, keyId } = razorpayFromEnv()
    const created = await client.createSubscription({
      planId,
      // `notes.user_id` is what lets every later webhook write stay scoped to a
      // user: Razorpay echoes notes back on each event, and the payload is
      // signature-verified before it is read. Without it the webhook would have
      // to look the row up by subscription id alone, which is the unscoped
      // query the repository exists to avoid.
      notes: { user_id: userId },
    })

    await upsertSubscription(userId, {
      razorpaySubscriptionId: created.id,
      razorpayPlanId: created.planId,
      status: created.status,
      razorpayCustomerId: created.customerId,
      currentStart: created.currentStart,
      currentEnd: created.currentEnd,
      chargeAt: created.chargeAt,
      endedAt: created.endedAt,
      // cancelAtCycleEnd is deliberately not written here. A fetched entity
      // does not carry that fact, and a brand-new subscription has not been
      // cancelled -- the column's `false` default is the truth.
    })

    return { ok: true, subscriptionId: created.id, keyId }
  } catch (error) {
    console.error(
      `LinkBud: startSubscription failed for user ${userId} - ${describeErrorForLog(error)}`,
    )
    return {
      ok: false,
      message: 'We could not start the subscription just now. Try again in a moment.',
    }
  }
}

/**
 * Record a completed checkout, then send the user on to build their strategy.
 *
 * `redirect()` sits outside every `try`, because it works by throwing Next's
 * navigation signal and a `catch` would swallow it.
 */
export async function confirmSubscription(input: {
  paymentId: string
  subscriptionId: string
  signature: string
}): Promise<BillingActionResult> {
  const userId = await requireUserId()

  const keySecret = getServerEnv().RAZORPAY_SECRET
  if (!keySecret) {
    console.error('LinkBud: RAZORPAY_SECRET is not set; cannot confirm a subscription')
    return { ok: false, message: GENERIC_FAILURE }
  }

  // (1) The message was not forged.
  if (
    !checkoutSignatureIsValid({
      paymentId: input.paymentId,
      subscriptionId: input.subscriptionId,
      signature: input.signature,
      keySecret,
    })
  ) {
    console.warn(
      `LinkBud: rejected a checkout confirmation with an invalid signature for user ${userId}`,
    )
    return { ok: false, message: GENERIC_FAILURE }
  }

  // (2) It is this user's subscription. A signature genuinely issued for
  // someone else's subscription verifies perfectly; without this check it
  // would activate whichever account happened to post it.
  const stored = await getSubscription(userId)
  if (!stored || stored.razorpaySubscriptionId !== input.subscriptionId) {
    console.warn(
      `LinkBud: user ${userId} confirmed subscription ${input.subscriptionId}, which is not theirs`,
    )
    return { ok: false, message: GENERIC_FAILURE }
  }

  let entitled: boolean
  try {
    // (3) Razorpay's own answer is what gets stored.
    const { client } = razorpayFromEnv()
    const live = await client.fetchSubscription(input.subscriptionId)

    await upsertSubscription(userId, {
      razorpaySubscriptionId: live.id,
      razorpayPlanId: live.planId,
      status: live.status,
      razorpayCustomerId: live.customerId,
      currentStart: live.currentStart,
      currentEnd: live.currentEnd,
      chargeAt: live.chargeAt,
      endedAt: live.endedAt,
      // Left alone, not overwritten. A confirm establishes the status and the
      // period; it says nothing about whether a cancellation is scheduled, and
      // the omitted field means the stored value survives.
    })

    entitled = entitlementFor({ ...stored, status: live.status })

    if (entitled) {
      const profile = await getProfile(userId)
      // Advance only from `paywall`. A lapsed customer resubscribing is already
      // past that step and must not be walked back through onboarding.
      if (profile?.onboardingStep === 'paywall') {
        await updateProfile(userId, { onboardingStep: nextStep('paywall') })
      }
    }
  } catch (error) {
    console.error(
      `LinkBud: confirmSubscription failed for user ${userId} - ${describeErrorForLog(error)}`,
    )
    // The webhook is an independent path to the same fact, so this is
    // recoverable rather than lost — which is what the message promises.
    return { ok: false, message: GENERIC_FAILURE }
  }

  revalidatePath('/billing')
  revalidatePath('/dashboard')

  if (!entitled) {
    // Razorpay accepted the payment but has not moved the subscription into a
    // state that grants access yet. Saying so beats redirecting them into a
    // guard that will bounce them straight back here.
    return {
      ok: false,
      message:
        'Your payment went through but the subscription has not activated yet. Reload this page in a moment.',
    }
  }

  // `/onboarding/strategy` — the next step in the wizard, via the same map the
  // guard reads, so this cannot drift from where the guard would send them.
  redirect(routeForStep(nextStep('paywall')))
}

/**
 * Cancel at the end of the current cycle.
 *
 * Not immediately: the customer has paid for the rest of the period and
 * `entitlementFor` keeps granting access while Razorpay holds the status at
 * `active`. Stays on the page — `revalidatePath` re-renders it in the same
 * response.
 */
export async function cancelSubscription(): Promise<BillingActionResult> {
  const userId = await requireUserId()

  const stored = await getSubscription(userId)
  if (!stored) {
    return { ok: false, message: 'There is no subscription to cancel.' }
  }

  try {
    const { client } = razorpayFromEnv()
    const cancelled = await client.cancelAtCycleEnd(stored.razorpaySubscriptionId)

    await upsertSubscription(userId, {
      razorpaySubscriptionId: cancelled.id,
      razorpayPlanId: cancelled.planId,
      status: cancelled.status,
      razorpayCustomerId: cancelled.customerId,
      currentStart: cancelled.currentStart,
      currentEnd: cancelled.currentEnd,
      chargeAt: cancelled.chargeAt,
      endedAt: cancelled.endedAt,
      // The one place this is known for certain: we just asked Razorpay to
      // cancel at cycle end and it accepted. Not inferred from the response --
      // asserted from the request.
      cancelAtCycleEnd: true,
    })
  } catch (error) {
    console.error(
      `LinkBud: cancelSubscription failed for user ${userId} - ${describeErrorForLog(error)}`,
    )
    return {
      ok: false,
      message: 'We could not cancel just now. Nothing has changed — try again in a moment.',
    }
  }

  revalidatePath('/billing')
  return { ok: true }
}
