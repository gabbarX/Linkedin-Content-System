import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { checkoutSignatureIsValid, webhookSignatureIsValid } from './signatures'

const KEY_SECRET = 'test_key_secret'
const WEBHOOK_SECRET = 'test_webhook_secret'

function sign(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('hex')
}

describe('checkoutSignatureIsValid', () => {
  const paymentId = 'pay_ABC123'
  const subscriptionId = 'sub_XYZ789'

  it('accepts a signature over payment_id|subscription_id, in that order', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, KEY_SECRET)
    expect(
      checkoutSignatureIsValid({ paymentId, subscriptionId, signature, keySecret: KEY_SECRET }),
    ).toBe(true)
  })

  it('rejects the two ids concatenated in the other order', () => {
    // Razorpay uses order_id|payment_id for one-off payments and
    // payment_id|subscription_id for subscriptions. Getting it backwards would
    // reject every genuine payment, which is a support outage, not a leak --
    // but it is the mistake that is easiest to make and hardest to spot.
    const signature = sign(`${subscriptionId}|${paymentId}`, KEY_SECRET)
    expect(
      checkoutSignatureIsValid({ paymentId, subscriptionId, signature, keySecret: KEY_SECRET }),
    ).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, 'wrong_secret')
    expect(
      checkoutSignatureIsValid({ paymentId, subscriptionId, signature, keySecret: KEY_SECRET }),
    ).toBe(false)
  })

  it('rejects a genuine signature replayed against a different subscription', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, KEY_SECRET)
    expect(
      checkoutSignatureIsValid({
        paymentId,
        subscriptionId: 'sub_SOMEONE_ELSE',
        signature,
        keySecret: KEY_SECRET,
      }),
    ).toBe(false)
  })

  it('rejects a genuine signature replayed with a different payment id', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, KEY_SECRET)
    expect(
      checkoutSignatureIsValid({
        paymentId: 'pay_OTHER',
        subscriptionId,
        signature,
        keySecret: KEY_SECRET,
      }),
    ).toBe(false)
  })

  it.each([[''], ['not-hex-at-all'], ['abc'], ['0'.repeat(63)], ['0'.repeat(65)], ['z'.repeat(64)]])(
    'rejects the malformed signature %o',
    (signature) => {
      expect(
        checkoutSignatureIsValid({ paymentId, subscriptionId, signature, keySecret: KEY_SECRET }),
      ).toBe(false)
    },
  )

  it('rejects rather than throws when the key secret is not configured', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, KEY_SECRET)
    expect(checkoutSignatureIsValid({ paymentId, subscriptionId, signature, keySecret: '' })).toBe(
      false,
    )
  })
})

describe('webhookSignatureIsValid', () => {
  const rawBody = '{"event":"subscription.activated","payload":{}}'

  it('accepts a signature over the exact raw body', () => {
    const signature = sign(rawBody, WEBHOOK_SECRET)
    expect(webhookSignatureIsValid({ rawBody, signature, webhookSecret: WEBHOOK_SECRET })).toBe(true)
  })

  it('rejects a body that has been parsed and re-serialised', () => {
    // The classic bug. JSON.parse then JSON.stringify changes whitespace and
    // key order, and the signature no longer matches. Razorpay's docs are
    // explicit that the RAW body must be hashed, which is why the route reads
    // request.text() and not request.json().
    const spaced = '{"event": "subscription.activated", "payload": {}}'
    const signature = sign(spaced, WEBHOOK_SECRET)
    const reserialised = JSON.stringify(JSON.parse(spaced))
    expect(reserialised).not.toBe(spaced)
    expect(
      webhookSignatureIsValid({ rawBody: reserialised, signature, webhookSecret: WEBHOOK_SECRET }),
    ).toBe(false)
  })

  it('rejects a body with one field changed', () => {
    const signature = sign(rawBody, WEBHOOK_SECRET)
    const tampered = rawBody.replace('activated', 'cancelled')
    expect(
      webhookSignatureIsValid({ rawBody: tampered, signature, webhookSecret: WEBHOOK_SECRET }),
    ).toBe(false)
  })

  it('rejects a body with a single byte appended', () => {
    const signature = sign(rawBody, WEBHOOK_SECRET)
    expect(
      webhookSignatureIsValid({
        rawBody: `${rawBody} `,
        signature,
        webhookSecret: WEBHOOK_SECRET,
      }),
    ).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    expect(
      webhookSignatureIsValid({
        rawBody,
        signature: sign(rawBody, 'wrong'),
        webhookSecret: WEBHOOK_SECRET,
      }),
    ).toBe(false)
  })

  it.each([[''], ['zz'], ['0'.repeat(64)], ['deadbeef']])(
    'rejects the bogus signature %o',
    (signature) => {
      expect(webhookSignatureIsValid({ rawBody, signature, webhookSecret: WEBHOOK_SECRET })).toBe(
        false,
      )
    },
  )

  it('rejects rather than throws when the webhook secret is not configured', () => {
    expect(
      webhookSignatureIsValid({ rawBody, signature: sign(rawBody, ''), webhookSecret: '' }),
    ).toBe(false)
  })

  it('accepts an empty body signed correctly, because an empty string is a valid message', () => {
    // Not a case Razorpay produces, but it pins that the length guard is on
    // the DIGEST and not on the body -- a guard on the body would be a
    // different rule that happened to pass the other tests.
    expect(
      webhookSignatureIsValid({
        rawBody: '',
        signature: sign('', WEBHOOK_SECRET),
        webhookSecret: WEBHOOK_SECRET,
      }),
    ).toBe(true)
  })
})
