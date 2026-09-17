'use client'

import { Loader2 } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { BillingActionResult } from '@/lib/billing/action-result'

const FALLBACK_ERROR_MESSAGE =
  'Something went wrong. Your subscription is untouched — try again in a moment.'

export type CancelSubscriptionProps = {
  /** When access ends, already formatted in the user's timezone. Null if unknown. */
  accessEndsOn: string | null
  cancelSubscription: () => Promise<BillingActionResult>
}

/**
 * "Cancel subscription", behind a confirm dialog.
 *
 * The dialog copy says what actually happens rather than what a cancel button
 * usually implies: billing stops at the end of the current cycle, access
 * continues until then because that period is paid for, and nothing the user
 * has made is deleted. Someone cancelling is deciding whether they lose their
 * work, and the honest answer is that they do not.
 *
 * Structure follows `regenerate-strategy.tsx` — same Base UI dialog, same
 * pending handling, same refusal to close mid-flight.
 */
export function CancelSubscription({ accessEndsOn, cancelSubscription }: CancelSubscriptionProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await cancelSubscription()
        if (result.ok) setOpen(false)
        else setError(result.message)
      } catch (thrown) {
        unstable_rethrow(thrown)
        setError(FALLBACK_ERROR_MESSAGE)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>Cancel subscription</DialogTrigger>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Cancel your subscription?</DialogTitle>
          <DialogDescription>
            Billing stops at the end of your current cycle. You keep full access
            {accessEndsOn ? ` until ${accessEndsOn}` : ' until it ends'}, because that period is
            already paid for. Your strategy, voice profile and business profile are not deleted —
            you can subscribe again later and pick them up where they are.
          </DialogDescription>
        </DialogHeader>

        {error && !isPending && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={isPending} />}>
            Keep it
          </DialogClose>
          <Button type="button" onClick={handleConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Cancelling…
              </>
            ) : error ? (
              'Try again'
            ) : (
              'Cancel it'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
