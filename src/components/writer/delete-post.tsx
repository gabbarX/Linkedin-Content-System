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

/**
 * Delete a draft and its three variants.
 *
 * Structure follows `regenerate-strategy.tsx`: controlled `open`, refuses to
 * close mid-flight so closing cannot hide the only pending indicator, and copy
 * that states exactly what is destroyed.
 *
 * **A labelled button, never an icon.** `docs/DESIGN-SYSTEM.md` bans icon-only
 * controls for destructive or irreversible actions, and this is both.
 */

type ActionResult = { ok: true } | { ok: false; message: string }

const FALLBACK_ERROR_MESSAGE = 'Something went wrong. The draft is still there -- try again.'

export type DeletePostProps = {
  postId: string
  /** Named in the dialog so the user can see which draft they are deleting. */
  title: string
  removePost: (postId: string) => Promise<ActionResult>
}

export function DeletePost({ postId, title, removePost }: DeletePostProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await removePost(postId)
        if (result.ok) {
          setOpen(false)
        } else {
          setError(result.message)
        }
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Delete draft</DialogTrigger>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Delete this draft?</DialogTitle>
          <DialogDescription>
            “{title}” and the three generated drafts behind it are removed. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {isPending && (
          <p className="flex items-center gap-2 text-sm text-text-muted" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Deleting…
          </p>
        )}
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
            {isPending ? 'Deleting…' : error ? 'Try again' : 'Delete draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
