'use client'

import { Loader2, Plus, X } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FieldOption, VoiceFormValues } from '@/lib/onboarding/voice-edit'
import { SELECT_CLASS_NAME } from './select-class-name'

/**
 * Structurally identical to `VoiceActionResult` in
 * `src/app/(app)/onboarding/voice/actions.ts` -- declared locally so this
 * component does not reach into an app route's internals for a type (same
 * pattern as `SamplesActionResult` in `sample-list.tsx`).
 *
 * Everything else imported from `@/lib/onboarding/voice-edit` above is a
 * **type-only** import: that module also value-imports the `server-only`
 * repository to build its option catalogues, so a runtime import here
 * would fail the client build. `import type` is erased entirely, so only
 * the shapes cross the boundary -- the actual option lists and the current
 * profile arrive as plain props from `page.tsx`, a Server Component.
 */
type VoiceActionResult = { ok: true } | { ok: false; message: string }

const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Try again in a moment.'

type MeasuredFields = {
  avgSentenceLength: number | null
  maxSentenceLength: number | null
  avgParagraphLines: number | null
}

type EnumOptionSet = {
  sentenceRhythm: FieldOption[]
  lineBreakStyle: FieldOption[]
  emojiPolicy: FieldOption[]
  hashtagPolicy: FieldOption[]
  povStrength: FieldOption[]
  humourLevel: FieldOption[]
  formality: FieldOption[]
}

export type VoiceEditorProps = {
  /** Pre-formatted for display (or null if never derived) -- formatted
   * server-side so the two renders can never disagree on locale/timezone. */
  derivedAtLabel: string | null
  measured: MeasuredFields
  initial: VoiceFormValues
  options: EnumOptionSet
  saveVoice: (values: VoiceFormValues) => Promise<VoiceActionResult>
  continueFromVoice: (values: VoiceFormValues) => Promise<VoiceActionResult>
}

function formatMeasurement(value: number | null, unit: string, decimals: number): string {
  if (value === null) return 'Not yet measured'
  return `${value.toFixed(decimals)} ${unit}`
}

type ArrayField = 'openerPatterns' | 'closerPatterns' | 'vocabularyMarkers' | 'bannedPhrases'

/**
 * One field's editor: an add box (Enter or the button adds it) plus the
 * items already saved, each removable. `items`/`onAdd`/`onRemove` are
 * plain callbacks rather than this component owning `form` state directly,
 * so `VoiceEditor` stays the single source of truth for the whole form --
 * required for Save and Continue to submit one consistent snapshot.
 */
function ListEditor({
  id,
  label,
  description,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  id: string
  label: string
  description: string
  placeholder: string
  items: string[]
  onAdd: (value: string) => void
  onRemove: (index: number) => void
}) {
  const [draft, setDraft] = useState('')

  function commit() {
    const trimmed = draft.trim()
    if (trimmed.length === 0) return
    // Skip a trimmed value already in the list rather than adding a second,
    // identical entry -- there is nothing for two copies of the same
    // pattern to mean that one copy doesn't already say.
    if (!items.includes(trimmed)) {
      onAdd(trimmed)
    }
    setDraft('')
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <Label htmlFor={id} className="text-base font-medium">
        {label}
      </Label>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>

      <div className="mt-4 flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={commit}>
          <Plus aria-hidden="true" />
          Add
        </Button>
      </div>

      {items.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2 text-sm"
            >
              <span>{item}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(index)}
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

/**
 * The Voice Profile review screen (Task 9, spec §4.1): "when output feels
 * wrong, the user has a dial to turn". Every judged field the model
 * produced is editable here; the three measured fields are shown for
 * context only, since they come straight from the samples, not a guess.
 *
 * Two independent actions, both submitting the same in-progress `form`
 * state:
 *
 *   * **Save changes** -- persists the edit and stays on this screen, so a
 *     user can correct the profile without committing to moving on.
 *   * **Continue** -- saves (so nothing typed is lost) and then advances
 *     onboarding. See `actions.ts` for why this sets `onboarding_step` to
 *     `'strategy'`, not `'done'` (Ruling R11).
 */
export function VoiceEditor({
  derivedAtLabel,
  measured,
  initial,
  options,
  saveVoice,
  continueFromVoice,
}: VoiceEditorProps) {
  const [form, setForm] = useState<VoiceFormValues>(initial)
  const [saveMessage, setSaveMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null,
  )
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const [isSaving, startSaveTransition] = useTransition()
  const [isAdvancing, startAdvanceTransition] = useTransition()
  const isBusy = isSaving || isAdvancing

  function addItem(field: ArrayField, value: string) {
    setForm((prev) => ({ ...prev, [field]: [...prev[field], value] }))
  }

  function removeItem(field: ArrayField, index: number) {
    setForm((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }))
  }

  function handleSave() {
    setSaveMessage(null)
    startSaveTransition(async () => {
      try {
        const result = await saveVoice(form)
        setSaveMessage(
          result.ok
            ? { kind: 'success', text: 'Saved.' }
            : { kind: 'error', text: result.message },
        )
      } catch (error) {
        // saveVoice never redirects on success, but requireUserId() inside
        // it redirects to /login on an expired session -- which rejects the
        // same way a real navigation does. Same reasoning as sample-list.tsx.
        unstable_rethrow(error)
        setSaveMessage({ kind: 'error', text: FALLBACK_ERROR_MESSAGE })
      }
    })
  }

  function handleContinue() {
    setAdvanceError(null)
    startAdvanceTransition(async () => {
      try {
        const result = await continueFromVoice(form)
        if (!result.ok) {
          setAdvanceError(result.message)
        }
      } catch (error) {
        // A redirect is not a failure -- it is how continueFromVoice
        // reports success. Re-throwing lets the framework's
        // RedirectBoundary navigate; only a genuine failure reaches the
        // message below. Same reasoning as sample-list.tsx.
        unstable_rethrow(error)
        setAdvanceError(FALLBACK_ERROR_MESSAGE)
      }
    })
  }

  const enumFields: {
    id: string
    label: string
    value: string
    options: FieldOption[]
    onChange: (value: string) => void
  }[] = [
    {
      id: 'sentenceRhythm',
      label: 'Sentence rhythm',
      value: form.sentenceRhythm,
      options: options.sentenceRhythm,
      onChange: (value) => setForm((prev) => ({ ...prev, sentenceRhythm: value })),
    },
    {
      id: 'lineBreakStyle',
      label: 'Line breaks',
      value: form.lineBreakStyle,
      options: options.lineBreakStyle,
      onChange: (value) => setForm((prev) => ({ ...prev, lineBreakStyle: value })),
    },
    {
      id: 'emojiPolicy',
      label: 'Emoji',
      value: form.emojiPolicy,
      options: options.emojiPolicy,
      onChange: (value) => setForm((prev) => ({ ...prev, emojiPolicy: value })),
    },
    {
      id: 'hashtagPolicy',
      label: 'Hashtags',
      value: form.hashtagPolicy,
      options: options.hashtagPolicy,
      onChange: (value) => setForm((prev) => ({ ...prev, hashtagPolicy: value })),
    },
    {
      id: 'povStrength',
      label: 'Point of view',
      value: form.povStrength,
      options: options.povStrength,
      onChange: (value) => setForm((prev) => ({ ...prev, povStrength: value })),
    },
    {
      id: 'humourLevel',
      label: 'Humour',
      value: form.humourLevel,
      options: options.humourLevel,
      onChange: (value) => setForm((prev) => ({ ...prev, humourLevel: value })),
    },
    {
      id: 'formality',
      label: 'Formality',
      value: form.formality,
      options: options.formality,
      onChange: (value) => setForm((prev) => ({ ...prev, formality: value })),
    },
  ]

  const listFields: {
    field: ArrayField
    id: string
    label: string
    description: string
    placeholder: string
  }[] = [
    {
      field: 'openerPatterns',
      id: 'opener-patterns',
      label: 'How your posts tend to open',
      description: 'The first line or two you keep coming back to.',
      placeholder: 'Here is the thing:',
    },
    {
      field: 'closerPatterns',
      id: 'closer-patterns',
      label: 'How your posts tend to close',
      description: 'A sign-off, a question, a call to action -- whatever you end with.',
      placeholder: 'What would you do?',
    },
    {
      field: 'vocabularyMarkers',
      id: 'vocabulary-markers',
      label: 'Words and phrases you use often',
      description: 'Terms that show up again and again in your writing.',
      placeholder: 'playbook',
    },
    {
      field: 'bannedPhrases',
      id: 'banned-phrases',
      label: 'Words and phrases to avoid',
      description: 'These will never appear in a drafted post.',
      placeholder: 'circle back',
    },
  ]

  return (
    <div className="py-10">
      <h1 className="font-display text-3xl">Your voice profile</h1>
      <p className="mt-2 text-[var(--color-text-muted)]">
        This is our best read of how you write, from the samples you gave us. Nothing here is
        final -- change anything that feels wrong.
      </p>
      {derivedAtLabel && (
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Derived from your writing samples on {derivedAtLabel}.
        </p>
      )}

      <div className="mt-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="font-display text-xl">Measured from your samples</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          These three numbers are measured directly from the samples you gave us, not guessed --
          they cannot be edited here.
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-[var(--color-text-muted)]">Average sentence length</dt>
            <dd className="mt-1 text-lg font-medium">
              {formatMeasurement(measured.avgSentenceLength, 'words', 1)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-[var(--color-text-muted)]">Longest sentence</dt>
            <dd className="mt-1 text-lg font-medium">
              {formatMeasurement(measured.maxSentenceLength, 'words', 0)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-[var(--color-text-muted)]">Average paragraph length</dt>
            <dd className="mt-1 text-lg font-medium">
              {formatMeasurement(measured.avgParagraphLines, 'lines', 1)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {enumFields.map((field) => {
          const selected = field.options.find((option) => option.value === field.value)
          return (
            <div key={field.id} className="rounded-lg border border-border bg-surface p-6">
              <Label htmlFor={field.id} className="text-base font-medium">
                {field.label}
              </Label>
              <select
                id={field.id}
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                className={`mt-3 ${SELECT_CLASS_NAME}`}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {selected && (
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  {selected.description}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6">
        {listFields.map((field) => (
          <ListEditor
            key={field.field}
            id={field.id}
            label={field.label}
            description={field.description}
            placeholder={field.placeholder}
            items={form[field.field]}
            onAdd={(value) => addItem(field.field, value)}
            onRemove={(index) => removeItem(field.field, index)}
          />
        ))}
      </div>

      {saveMessage && (
        <p
          role={saveMessage.kind === 'error' ? 'alert' : 'status'}
          className={`mt-6 text-sm ${saveMessage.kind === 'error' ? 'text-danger' : 'text-[var(--color-text-muted)]'}`}
        >
          {saveMessage.text}
        </p>
      )}

      {advanceError && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {advanceError}
        </p>
      )}

      <div className="mt-10 flex items-center justify-between">
        <Button type="button" variant="outline" onClick={handleSave} disabled={isBusy}>
          {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
        <Button type="button" onClick={handleContinue} disabled={isBusy}>
          {isAdvancing && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isAdvancing ? 'Continuing…' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
