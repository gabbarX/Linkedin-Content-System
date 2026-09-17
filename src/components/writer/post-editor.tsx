'use client'

import { Check, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useState, useTransition } from 'react'
import { LinkedInPreview } from '@/components/writer/linkedin-preview'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { countCharacters } from '@/lib/post/measure'
import { APPROACH_META, LINKEDIN_CHAR_LIMIT, type VariantApproach } from '@/lib/post/vocabulary'

/**
 * The editor: three drafts, the one being worked on, and a LinkedIn preview.
 *
 * Structurally identical to `BusinessProfileForm`'s message and pending
 * handling and `RegenerateStrategy`'s dialog, because those are the house
 * patterns and a third shape here would be a third thing to maintain.
 *
 * Two behaviours are worth reading the code for:
 *
 *   * **Switching drafts asks before discarding edits.** Free while the text
 *     is untouched; once edited, a dialog names what is lost. Ten minutes of
 *     work must not disappear on a misclick, and there is no undo.
 *   * **Saving is never blocked by length.** Over LinkedIn's limit the counter
 *     turns to the danger token and says how far over, and Save still works.
 *     Losing a customer's words to a validation rule is worse than storing a
 *     post that is too long.
 *
 * Result types are declared locally rather than imported from the actions
 * module, so this component does not reach into a server file for a type —
 * the same reason `VoiceEditor` declares its own.
 */

type ActionResult = { ok: true } | { ok: false; message: string }

export type EditorVariant = {
  variantIndex: number
  approach: VariantApproach
  content: string
}

export type PostEditorProps = {
  postId: string
  authorName: string
  variants: EditorVariant[]
  initialText: string
  initialVariantIndex: number | null
  initialStatus: 'draft' | 'approved' | 'scheduled' | 'published' | 'failed'
  pendingPolish: string | null
  chooseVariant: (postId: string, variantIndex: number) => Promise<ActionResult>
  saveDraft: (postId: string, text: string) => Promise<ActionResult>
  setReady: (postId: string, ready: boolean) => Promise<ActionResult>
  polishDraft: (postId: string) => Promise<ActionResult>
  resolvePolish: (postId: string, outcome: 'accepted' | 'discarded') => Promise<ActionResult>
  regenerateVariants: (postId: string) => Promise<ActionResult>
}

const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Your draft is untouched -- try again.'

export function PostEditor({
  postId,
  authorName,
  variants,
  initialText,
  initialVariantIndex,
  initialStatus,
  pendingPolish,
  chooseVariant,
  saveDraft,
  setReady,
  polishDraft,
  resolvePolish,
  regenerateVariants,
}: PostEditorProps) {
  const [text, setText] = useState(initialText)
  const [savedText, setSavedText] = useState(initialText)
  const [chosen, setChosen] = useState<number | null>(initialVariantIndex)
  const [isReady, setIsReady] = useState(initialStatus === 'approved')
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [switchTo, setSwitchTo] = useState<EditorVariant | null>(null)
  const [regenerateOpen, setRegenerateOpen] = useState(false)

  const [isSaving, startSave] = useTransition()
  const [isChoosing, startChoose] = useTransition()
  const [isPolishing, startPolish] = useTransition()
  const [isResolving, startResolve] = useTransition()
  const [isReadying, startReady] = useTransition()
  const [isRegenerating, startRegenerate] = useTransition()

  const isBusy =
    isSaving || isChoosing || isPolishing || isResolving || isReadying || isRegenerating

  const charCount = countCharacters(text)
  const over = charCount - LINKEDIN_CHAR_LIMIT
  const isOver = over > 0
  const hasUnsavedEdits = text !== savedText
  const hasText = text.trim().length > 0

  /** Every action call goes through here, so none of them can forget
   *  `unstable_rethrow` — a redirect on an expired session rejects the same
   *  way a real navigation does. */
  function run(
    start: ReturnType<typeof useTransition>[1],
    action: () => Promise<ActionResult>,
    onSuccess?: () => void,
    successText?: string,
  ) {
    setMessage(null)
    start(async () => {
      try {
        const result = await action()
        if (result.ok) {
          onSuccess?.()
          if (successText) setMessage({ kind: 'success', text: successText })
        } else {
          setMessage({ kind: 'error', text: result.message })
        }
      } catch (error) {
        unstable_rethrow(error)
        setMessage({ kind: 'error', text: FALLBACK_ERROR_MESSAGE })
      }
    })
  }

  function applyVariant(variant: EditorVariant) {
    run(
      startChoose,
      () => chooseVariant(postId, variant.variantIndex),
      () => {
        setText(variant.content)
        setSavedText(variant.content)
        setChosen(variant.variantIndex)
        setIsReady(false)
      },
    )
  }

  function handleVariantClick(variant: EditorVariant) {
    if (variant.variantIndex === chosen) return
    // Only ask when there is something to lose.
    if (chosen !== null && hasUnsavedEdits) {
      setSwitchTo(variant)
      return
    }
    applyVariant(variant)
  }

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div>
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="drafts-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="drafts-heading" className="font-display text-xl">
              Three drafts
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRegenerateOpen(true)}
              disabled={isBusy}
            >
              Write three more
            </Button>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Same brief, three different ways in. Pick the one closest to right, then edit it — you
            can copy lines from the other two by hand.
          </p>

          <div className="mt-4 grid gap-3">
            {variants.map((variant) => {
              const meta = APPROACH_META[variant.approach]
              const isChosen = variant.variantIndex === chosen
              return (
                <article
                  key={variant.variantIndex}
                  className={`rounded-lg border bg-surface p-5 ${
                    isChosen ? 'border-brand' : 'border-border'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-medium">
                        {meta.label}
                        {isChosen && (
                          <span className="ml-2 text-xs font-medium text-brand">
                            <Check className="mr-1 inline size-3.5" aria-hidden="true" />
                            Working on this one
                          </span>
                        )}
                      </h3>
                      <p className="mt-1 text-sm text-text-muted">{meta.description}</p>
                    </div>
                    <span className="text-xs text-text-muted">
                      {countCharacters(variant.content).toLocaleString()} characters
                    </span>
                  </div>

                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-text-muted select-none hover:text-text">
                      Read this draft
                    </summary>
                    <p className="prose-post mt-3">{variant.content}</p>
                  </details>

                  {!isChosen && (
                    <div className="mt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleVariantClick(variant)}
                        disabled={isBusy}
                      >
                        {chosen === null ? 'Work on this one' : 'Switch to this one'}
                      </Button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {chosen !== null && (
          <section aria-labelledby="editor-heading" className="mt-10">
            <h2 id="editor-heading" className="font-display text-xl">
              Your post
            </h2>

            {pendingPolish === null ? (
              <>
                <div className="mt-4">
                  <Textarea
                    id="post-text"
                    aria-label="Post text"
                    value={text}
                    rows={18}
                    onChange={(event) => setText(event.target.value)}
                    className="prose-post max-w-none font-sans"
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p
                    className={`text-sm ${isOver ? 'text-danger' : 'text-text-muted'}`}
                    role={isOver ? 'alert' : 'status'}
                  >
                    {charCount.toLocaleString()} / {LINKEDIN_CHAR_LIMIT.toLocaleString()}
                    {isOver
                      ? ` — ${over.toLocaleString()} over LinkedIn's limit. You can still save.`
                      : ''}
                  </p>
                  {hasUnsavedEdits && !isOver && (
                    <p className="text-sm text-text-muted">Unsaved changes.</p>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={() =>
                      run(
                        startSave,
                        () => saveDraft(postId, text),
                        () => setSavedText(text),
                        'Saved.',
                      )
                    }
                    disabled={isBusy || !hasUnsavedEdits}
                  >
                    {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}
                    {isSaving ? 'Saving…' : 'Save draft'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => run(startPolish, () => polishDraft(postId))}
                    disabled={isBusy || !hasText || hasUnsavedEdits}
                  >
                    {isPolishing ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Wand2 aria-hidden="true" />
                    )}
                    {isPolishing ? 'Polishing…' : 'Polish it'}
                  </Button>

                  <Button
                    type="button"
                    variant={isReady ? 'outline' : 'secondary'}
                    onClick={() =>
                      run(
                        startReady,
                        () => setReady(postId, !isReady),
                        () => setIsReady((previous) => !previous),
                      )
                    }
                    disabled={isBusy || !hasText || hasUnsavedEdits}
                  >
                    {isReadying && <Loader2 className="animate-spin" aria-hidden="true" />}
                    {isReady ? 'Unmark ready' : 'Mark ready to publish'}
                  </Button>
                </div>

                {hasUnsavedEdits && (
                  <p className="mt-3 text-sm text-text-muted">
                    Save your changes before polishing or marking this ready.
                  </p>
                )}

                {isReady && !hasUnsavedEdits && (
                  <p className="mt-3 text-sm text-text-muted" role="status">
                    Marked ready. Publishing to LinkedIn arrives with the publisher — every post
                    goes out on a tap from you, never on a timer.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-text-muted">
                  A polished version is ready. Your own text is on the left and nothing has been
                  changed yet — keep yours or take this one.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-surface p-5">
                    <h3 className="text-sm font-medium">Yours</h3>
                    <p className="prose-post mt-3 text-sm">{text}</p>
                  </div>
                  <div className="rounded-lg border border-brand bg-surface p-5">
                    <h3 className="text-sm font-medium">
                      <Sparkles className="mr-1 inline size-3.5" aria-hidden="true" />
                      Polished
                    </h3>
                    <p className="prose-post mt-3 text-sm">{pendingPolish}</p>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() =>
                      run(
                        startResolve,
                        () => resolvePolish(postId, 'accepted'),
                        () => {
                          setText(pendingPolish)
                          setSavedText(pendingPolish)
                        },
                      )
                    }
                    disabled={isBusy}
                  >
                    {isResolving && <Loader2 className="animate-spin" aria-hidden="true" />}
                    Use the polished version
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => run(startResolve, () => resolvePolish(postId, 'discarded'))}
                    disabled={isBusy}
                  >
                    Keep mine
                  </Button>
                </div>
              </div>
            )}

            {message && (
              <p
                role={message.kind === 'error' ? 'alert' : 'status'}
                className={`mt-4 text-sm ${
                  message.kind === 'error' ? 'text-danger' : 'text-text-muted'
                }`}
              >
                {message.text}
              </p>
            )}
          </section>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      <aside className="lg:sticky lg:top-10 lg:self-start">
        <h2 className="font-display text-xl">Preview</h2>
        <p className="mt-1 text-sm text-text-muted">How this reads in the feed.</p>
        <div className="mt-4">
          <LinkedInPreview text={text} authorName={authorName} />
        </div>
      </aside>

      {/* Switching away from edited text ---------------------------------- */}
      <Dialog
        open={switchTo !== null}
        onOpenChange={(next) => {
          if (isBusy) return
          if (!next) setSwitchTo(null)
        }}
      >
        <DialogContent showCloseButton={!isBusy}>
          <DialogHeader>
            <DialogTitle>
              Switch to the {switchTo ? APPROACH_META[switchTo.approach].label : ''} draft?
            </DialogTitle>
            <DialogDescription>
              You have edited this post. Switching replaces your text with that draft, and your
              edits cannot be recovered. The draft you are on now stays available to switch back
              to — but your edits to it do not.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={isBusy} />}>
              Keep editing
            </DialogClose>
            <Button
              type="button"
              disabled={isBusy}
              onClick={() => {
                const target = switchTo
                setSwitchTo(null)
                if (target) applyVariant(target)
              }}
            >
              {isChoosing ? 'Switching…' : 'Switch and lose my edits'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerating the three drafts ------------------------------------ */}
      <Dialog
        open={regenerateOpen}
        onOpenChange={(next) => {
          if (isRegenerating) return
          setRegenerateOpen(next)
        }}
      >
        <DialogContent showCloseButton={!isRegenerating}>
          <DialogHeader>
            <DialogTitle>Write three new drafts?</DialogTitle>
            <DialogDescription>
              The three drafts above are replaced with three new ones from the same brief. Your own
              text is not touched — if you have been editing, your post stays exactly as it is and
              you can pick from the new drafts or ignore them.
            </DialogDescription>
          </DialogHeader>
          {isRegenerating && (
            <p className="flex items-center gap-2 text-sm text-text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Writing three drafts — up to a minute.
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={isRegenerating} />}>
              Keep these
            </DialogClose>
            <Button
              type="button"
              disabled={isRegenerating}
              onClick={() =>
                run(
                  startRegenerate,
                  () => regenerateVariants(postId),
                  () => setRegenerateOpen(false),
                )
              }
            >
              {isRegenerating ? 'Writing…' : 'Write three new ones'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
