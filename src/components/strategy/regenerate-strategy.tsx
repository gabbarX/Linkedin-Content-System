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

/** Structurally identical to `StrategyActionResult` in
 * `src/server/strategy/actions.ts`; declared locally, same pattern as
 * `strategy-builder.tsx`. */
type StrategyActionResult = { ok: true } | { ok: false; message: string }

const FALLBACK_ERROR_MESSAGE =
  'Something went wrong. Your current strategy is untouched -- try again in a moment.'

export type RegenerateStrategyProps = {
  version: number
  buildStrategy: () => Promise<StrategyActionResult>
}

/**
 * "Regenerate" (Ruling R-M3-7): a labelled button behind a confirm dialog,
 * because it replaces every pillar and slot and there is no undo. The
 * action is the same `buildStrategy` the onboarding step uses;
 * `replaceStrategy` bumps the version and swaps the plan in one
 * transaction, so a failure part-way leaves the current plan as it was --
 * which is what the dialog copy promises.
 *
 * The dialog stays open while the build runs (a minute or more) so the
 * pending state has somewhere to live, and closes itself by navigating: a
 * successful build redirects to `/strategy`, which re-renders this page.
 */
export function RegenerateStrategy({ version, buildStrategy }: RegenerateStrategyProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await buildStrategy()
        if (!result.ok) setError(result.message)
      } catch (thrown) {
        // A redirect is how a successful build reports success; let the
        // framework's RedirectBoundary navigate.
        unstable_rethrow(thrown)
        setError(FALLBACK_ERROR_MESSAGE)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Not while a build is in flight: closing would hide the only
        // pending indicator while the server keeps working.
        if (isPending) return
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>Regenerate strategy</DialogTrigger>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Replace this strategy?</DialogTitle>
          <DialogDescription>
            Every pillar and all of the slots will be rebuilt from your current business and voice
            profiles, and this week will be briefed again. Version {version} cannot be restored
            afterwards. If the rebuild fails part-way, nothing changes.
          </DialogDescription>
        </DialogHeader>

        {isPending && (
          <p className="flex items-center gap-2 text-sm text-text-muted" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Rebuilding your twelve weeks. This usually takes about a minute, sometimes two.
          </p>
        )}

        {error && !isPending && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={isPending} />}>Keep it</DialogClose>
          <Button type="button" onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Rebuilding…' : error ? 'Try again' : 'Replace it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
