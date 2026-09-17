'use client'

import { Loader2 } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import type { BillingActionResult, StartSubscriptionResult } from '@/lib/billing/action-result'
import { PLAN_PRICE_LABEL } from '@/lib/billing/plan'

/**
 * Razorpay Checkout is a script tag, not a package. CLAUDE.md treats every
 * dependency as a lifetime maintenance cost, and the npm wrapper would only
 * wrap a global this file already has to type.
 *
 * It is loaded on the first tap rather than with the page: someone who came
 * here to read their status should not pull third-party JavaScript to do it,
 * and the script only matters once they decide to pay.
 */
const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

type CheckoutResponse = {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

type CheckoutOptions = {
  key: string
  subscription_id: string
  name: string
  description: string
  handler: (response: CheckoutResponse) => void
  modal: { ondismiss: () => void }
  prefill: { email: string }
  theme?: { color: string }
}

type RazorpayCheckout = { open: () => void }

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => RazorpayCheckout
  }
}

function loadCheckout(): Promise<NonNullable<Window['Razorpay']>> {
  return new Promise((resolve, reject) => {
    const already = window.Razorpay
    if (already) {
      resolve(already)
      return
    }
    const script = document.createElement('script')
    script.src = CHECKOUT_SRC
    script.async = true
    script.onload = () => {
      const loaded = window.Razorpay
      if (loaded) resolve(loaded)
      else reject(new Error('Razorpay Checkout loaded but did not register'))
    }
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded'))
    document.body.appendChild(script)
  })
}

/**
 * Razorpay's `theme.color` wants a hex string, and the accent is a CSS custom
 * property. It is read at click time and handed over only if it really is a
 * hex value; otherwise `theme` is omitted entirely and Razorpay uses its own
 * default.
 *
 * Omitting is the right fallback, not inventing one: CLAUDE.md bans hard-coded
 * hex in components, and a slightly-off accent inside a third-party modal is
 * not worth a second definition of the brand colour that could drift.
 */
function checkoutTheme(): { color: string } | undefined {
  if (typeof window === 'undefined') return undefined
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--lb-accent')
    .trim()
  return /^#[0-9a-f]{3,8}$/i.test(accent) ? { color: accent } : undefined
}

const FALLBACK_ERROR_MESSAGE =
  'Something went wrong opening the payment window. Nothing has been charged — try again in a moment.'

export type StartSubscriptionProps = {
  email: string
  /** The product name shown inside Razorpay's own modal. */
  label: string
  startSubscription: () => Promise<StartSubscriptionResult>
  confirmSubscription: (input: {
    paymentId: string
    subscriptionId: string
    signature: string
  }) => Promise<BillingActionResult>
}

/**
 * The pay button.
 *
 * Three server round trips, in order: create the subscription, let Razorpay
 * take the money, then confirm server-side. The confirm is what actually
 * grants access — nothing the modal hands back is trusted on its own, and the
 * action re-fetches the subscription from Razorpay before believing it.
 *
 * `modal.ondismiss` clears the pending state. Without it, closing Razorpay's
 * window leaves a spinner running forever, which reads as a hang on the one
 * screen where a user is most anxious about whether they have been charged.
 */
export function StartSubscription({
  email,
  label,
  startSubscription,
  confirmSubscription,
}: StartSubscriptionProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Distinct from `isPending`: the transition ends when the server action
  // resolves, but the user is still inside Razorpay's modal after that.
  const [isOpen, setIsOpen] = useState(false)

  const busy = isPending || isOpen

  function handleConfirm(response: CheckoutResponse) {
    setIsOpen(false)
    startTransition(async () => {
      try {
        const result = await confirmSubscription({
          paymentId: response.razorpay_payment_id,
          subscriptionId: response.razorpay_subscription_id,
          signature: response.razorpay_signature,
        })
        if (!result.ok) setError(result.message)
      } catch (thrown) {
        // A successful confirm reports success by redirecting; let the
        // framework's RedirectBoundary navigate.
        unstable_rethrow(thrown)
        setError(FALLBACK_ERROR_MESSAGE)
      }
    })
  }

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const started = await startSubscription()
      if (!started.ok) {
        setError(started.message)
        return
      }

      let Checkout: NonNullable<Window['Razorpay']>
      try {
        Checkout = await loadCheckout()
      } catch {
        // A blocked script or an offline browser. The subscription exists in
        // Razorpay at this point but is unpaid and will expire on its own, so
        // there is nothing to undo.
        setError(
          'The payment window could not load. Check that no extension is blocking it, then try again.',
        )
        return
      }

      setIsOpen(true)
      const theme = checkoutTheme()
      new Checkout({
        key: started.keyId,
        subscription_id: started.subscriptionId,
        name: 'LinkBud',
        description: label,
        handler: handleConfirm,
        modal: { ondismiss: () => setIsOpen(false) },
        prefill: { email },
        ...(theme && { theme }),
      }).open()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={handleClick} disabled={busy} className="self-start">
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Opening…
          </>
        ) : (
          `Subscribe — ${PLAN_PRICE_LABEL}`
        )}
      </Button>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
