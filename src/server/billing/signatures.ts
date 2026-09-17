import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The two HMAC-SHA256 checks Razorpay defines. Nothing else lives in this file
 * — it is the security boundary for the whole billing milestone and should be
 * readable in one sitting.
 *
 * Both compare in constant time. The practical risk of a timing oracle on a
 * 64-character hex digest over the public internet is small; `timingSafeEqual`
 * costs nothing, and "small" is not an argument anyone should have to
 * re-litigate when reading this later.
 *
 * Both return a boolean rather than throwing. A failed signature is an expected
 * condition on a public endpoint — it is what an attacker's request looks like
 * — and the caller decides the response.
 */

/**
 * Constant-time comparison of two hex digests.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so the length is
 * checked on the strings first and short-circuits. What that leaks is the
 * length of the attacker's own input, which they already know.
 *
 * `Buffer.from(s, 'hex')` stops at the first non-hex character rather than
 * throwing, so `'zz'` decodes to an empty buffer and `'z'.repeat(64)` does too.
 * Comparing the decoded lengths as well is what catches those: a malformed
 * signature cannot decode to 32 bytes unless it is genuinely 64 hex characters.
 */
function hexDigestsMatch(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false
  const expectedBytes = Buffer.from(expected, 'hex')
  const receivedBytes = Buffer.from(received, 'hex')
  if (expectedBytes.length === 0 || expectedBytes.length !== receivedBytes.length) return false
  return timingSafeEqual(expectedBytes, receivedBytes)
}

/**
 * The signature Razorpay Checkout hands the browser on a successful
 * subscription payment: HMAC-SHA256 of `payment_id|subscription_id`, keyed with
 * the API key secret.
 *
 * **The order of the two ids is load-bearing and is not the same as for a
 * one-off order**, which signs `order_id|payment_id`. A test pins it.
 *
 * Passing this proves the message was not forged. It does **not** prove the
 * subscription is active, nor that it belongs to the person whose session sent
 * it. `confirmSubscription` checks ownership against our own row and then
 * re-fetches the real status from Razorpay. This function is one of three
 * things that have to be true, not the whole check.
 */
export function checkoutSignatureIsValid({
  paymentId,
  subscriptionId,
  signature,
  keySecret,
}: {
  paymentId: string
  subscriptionId: string
  signature: string
  keySecret: string
}): boolean {
  // An unconfigured secret must never verify. Without this, `createHmac` would
  // happily key on the empty string and an attacker who knew that could forge
  // a signature against a misconfigured deployment.
  if (keySecret.length === 0) return false
  const expected = createHmac('sha256', keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex')
  return hexDigestsMatch(expected, signature)
}

/**
 * The `X-Razorpay-Signature` header on a webhook: HMAC-SHA256 of the raw
 * request body, keyed with the webhook secret.
 *
 * `rawBody` must be the bytes as received. Parsing and re-serialising changes
 * whitespace and key order and the signature will not match — a test pins that
 * too, because it is the mistake everyone makes once.
 */
export function webhookSignatureIsValid({
  rawBody,
  signature,
  webhookSecret,
}: {
  rawBody: string
  signature: string
  webhookSecret: string
}): boolean {
  if (webhookSecret.length === 0) return false
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
  return hexDigestsMatch(expected, signature)
}
