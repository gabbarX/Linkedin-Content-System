import { NextResponse } from 'next/server'
import { getServerEnv } from '@/lib/env.server'
import { readWebhookEvent } from '@/server/billing/webhook-events'
import { webhookSignatureIsValid } from '@/server/billing/signatures'
import { applySubscriptionEvent } from '@/server/db/repositories/subscriptions'

/**
 * Razorpay's webhook endpoint — the authoritative path for subscription state,
 * and the only one that works when the customer's browser dies immediately
 * after they pay.
 *
 * `src/proxy.ts` excludes `/api` from its matcher, so this never runs through
 * the session refresh. That is correct: a webhook carries no cookies and has no
 * session to refresh.
 *
 * Three rules govern the response code, and they are not interchangeable:
 *
 *   401 — the signature did not verify. This is the only rejection. It must not
 *         be 200: a wrong webhook secret would otherwise look perfectly healthy
 *         in the Razorpay dashboard forever while no state was ever written.
 *   200 — everything else, including an event we choose not to act on and an
 *         event discarded as stale. Razorpay retries anything that is not 2xx,
 *         so answering "I chose not to act" with an error produces an infinite
 *         retry loop over an event that will never become actionable.
 *   500 — only a genuine failure on our side, such as the database being
 *         unreachable, where a retry is exactly what we want.
 *
 * The body is read with `request.text()` and hashed as received. Calling
 * `request.json()` first and re-serialising changes whitespace and key order
 * and the signature stops matching — see `signatures.test.ts`, which pins it.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = getServerEnv().RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    // Fail closed and loudly. Accepting unverified events would let anyone who
    // knows the URL grant themselves a subscription.
    console.error('LinkBud: RAZORPAY_WEBHOOK_SECRET is not set; refusing the Razorpay webhook')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature') ?? ''

  if (!webhookSignatureIsValid({ rawBody, signature, webhookSecret: secret })) {
    console.warn('LinkBud: rejected a Razorpay webhook with an invalid signature')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    // Signed but unparseable should be impossible, and a retry cannot fix it.
    console.error('LinkBud: a signature-valid Razorpay webhook body was not JSON')
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const read = readWebhookEvent(body)
  // A payment or invoice event, or a subscription event LinkBud did not
  // create. Nothing to do, and nothing a retry would improve.
  if (!read) return NextResponse.json({ ok: true }, { status: 200 })

  try {
    const updated = await applySubscriptionEvent(
      read.userId,
      read.razorpaySubscriptionId,
      read.patch,
    )
    if (updated === 0) {
      // Either the event is older than one already applied — the ordering
      // guard doing its job — or no row matches that user and subscription.
      // Both are worth seeing in a log and neither is worth a retry.
      console.warn(
        `LinkBud: Razorpay webhook for subscription ${read.razorpaySubscriptionId} changed no rows ` +
          '(a stale event, or no matching subscription for that user)',
      )
    }
  } catch (error) {
    // Error.message and .name are non-enumerable, so logging the error object
    // itself serialises to {} — the same reasoning as the strategy actions.
    console.error(
      `LinkBud: failed to apply a Razorpay webhook for subscription ${read.razorpaySubscriptionId} - ` +
        (error instanceof Error ? `${error.name}: ${error.message}` : String(error)),
    )
    // Our fault, so let Razorpay retry.
    return NextResponse.json({ error: 'apply failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
