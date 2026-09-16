'use client'

import { Loader2, Plus, X } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BUSINESS_PROFILE_QUESTIONS, type BusinessProfileFormValues } from '@/lib/onboarding/business-profile-edit'

/**
 * Structurally identical to `BusinessProfileActionResult` in
 * `src/app/(app)/settings/business/actions.ts` -- declared locally rather
 * than imported, so this component does not reach into an app route's
 * internals for a type. Same pattern as `VoiceEditor`'s local
 * `VoiceActionResult`.
 */
type BusinessProfileActionResult = { ok: true } | { ok: false; message: string }

const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Try again in a moment.'

export type BusinessProfileFormProps = {
  initial: BusinessProfileFormValues
  saveBusinessProfile: (
    values: BusinessProfileFormValues,
  ) => Promise<BusinessProfileActionResult>
}

/** Every field but `taboos` -- the one list field gets its own dedicated
 * add/remove UI below, so the plain text/textarea branch only ever needs
 * to read and write a string. */
type ScalarField = Exclude<keyof BusinessProfileFormValues, 'taboos'>

/**
 * The Business Profile settings editor (Task 10, Ruling R5): the same
 * fields the interview wizard asks, presented as one page instead of a
 * wizard, because reviewing an existing profile is not the same act as
 * being interviewed for the first time. Renders directly from
 * `BUSINESS_PROFILE_QUESTIONS` -- prompts, helper text and required-ness
 * all come from there, never redeclared here.
 *
 * One action, unlike the voice editor's two (`saveVoice` /
 * `continueFromVoice`): there is no "advance onboarding" step attached to
 * this page, so there is exactly one thing a submit can mean.
 */
export function BusinessProfileForm({ initial, saveBusinessProfile }: BusinessProfileFormProps) {
  const [form, setForm] = useState<BusinessProfileFormValues>(initial)
  const [taboosDraft, setTaboosDraft] = useState('')
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [isSaving, startSaveTransition] = useTransition()

  function setField(field: ScalarField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function addTaboo() {
    const trimmed = taboosDraft.trim()
    if (trimmed.length === 0) return
    setForm((prev) =>
      prev.taboos.includes(trimmed) ? prev : { ...prev, taboos: [...prev.taboos, trimmed] },
    )
    setTaboosDraft('')
  }

  function removeTaboo(index: number) {
    setForm((prev) => ({ ...prev, taboos: prev.taboos.filter((_, i) => i !== index) }))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setMessage(null)
    startSaveTransition(async () => {
      try {
        const result = await saveBusinessProfile(form)
        setMessage(
          result.ok
            ? { kind: 'success', text: 'Saved.' }
            : { kind: 'error', text: result.message },
        )
      } catch (error) {
        // saveBusinessProfile never redirects on success, but the action
        // redirects to /login on an expired session -- which rejects the
        // same way a real navigation does. Same reasoning as voice-editor.tsx.
        unstable_rethrow(error)
        setMessage({ kind: 'error', text: FALLBACK_ERROR_MESSAGE })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-6">
        {BUSINESS_PROFILE_QUESTIONS.map((question) => {
          if (question.field === 'taboos') {
            return (
              <div key={question.id} className="rounded-lg border border-border bg-surface p-6">
                <Label htmlFor={question.id} className="text-base font-medium">
                  {question.prompt}
                </Label>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{question.helper}</p>

                <div className="mt-4 flex gap-2">
                  <Input
                    id={question.id}
                    value={taboosDraft}
                    placeholder="A topic you won't post about"
                    onChange={(event) => setTaboosDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addTaboo()
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addTaboo}>
                    <Plus aria-hidden="true" />
                    Add
                  </Button>
                </div>

                {form.taboos.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-2">
                    {form.taboos.map((item, index) => (
                      <li
                        key={`${item}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2 text-sm"
                      >
                        <span>{item}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTaboo(index)}
                          aria-label={`Remove "${item}"`}
                        >
                          <X aria-hidden="true" className="size-3.5" />
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          }

          // Narrowed by the `taboos` branch's early return above -- every
          // other business-profile field is a plain string, so `field` here
          // is exactly `ScalarField` with no cast needed.
          const field = question.field

          return (
            <div key={question.id} className="rounded-lg border border-border bg-surface p-6">
              <Label htmlFor={question.id} className="text-base font-medium">
                {question.prompt}
                {!question.required && (
                  <span className="font-normal text-[var(--color-text-muted)]"> (optional)</span>
                )}
              </Label>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{question.helper}</p>

              <div className="mt-4">
                {question.input === 'textarea' ? (
                  <Textarea
                    id={question.id}
                    value={form[field]}
                    rows={4}
                    onChange={(event) => setField(field, event.target.value)}
                  />
                ) : (
                  <Input
                    id={question.id}
                    value={form[field]}
                    onChange={(event) => setField(field, event.target.value)}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`mt-6 text-sm ${message.kind === 'error' ? 'text-danger' : 'text-[var(--color-text-muted)]'}`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-10">
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
