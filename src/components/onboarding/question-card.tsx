'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { InterviewQuestion } from '@/lib/onboarding/questions'

/**
 * Structurally identical to `SaveAnswerResult` in
 * `src/app/(app)/onboarding/interview/actions.ts` — declared locally rather
 * than imported so this component does not reach into an app-route's
 * internals for a type. A success redirects (the server action throws
 * Next's navigation signal before returning), so the only value this
 * component ever actually receives back is a validation failure.
 */
type SaveAnswerResult = { ok: false; message: string }

type QuestionCardProps = {
  question: InterviewQuestion
  index: number
  total: number
  initialValue: string | string[] | number | undefined
  /** True when the server bounced a just-finished interview back to this
   * question because the completed draft failed validation here. */
  showInvalidNotice: boolean
  /** The full IANA zone list, computed server-side (`page.tsx`) — only
   * present for the `timezone` question. */
  timezoneOptions?: string[]
  saveAnswer: (questionId: string, rawValue: string | string[]) => Promise<SaveAnswerResult>
}

/** What the question's input widget should show on first render. Browser
 * timezone detection happens here, client-side, per the brief:
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` is the *browser's* zone
 * — computing it on the server would give the server's zone instead. */
function computeInitialRawValue(
  question: InterviewQuestion,
  initialValue: string | string[] | number | undefined,
): string {
  if (question.input === 'list') {
    return Array.isArray(initialValue) ? initialValue.join('\n') : ''
  }
  if (question.field === 'cadencePerWeek') {
    return typeof initialValue === 'number' ? String(initialValue) : ''
  }
  if (question.input === 'timezone' && typeof initialValue !== 'string') {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return ''
    }
  }
  return typeof initialValue === 'string' ? initialValue : ''
}

const selectClassName =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm'

/**
 * One question, one screen. Renders the widget for `question.input`, keeps
 * it as a single controlled string (list answers are newline-separated,
 * numeric answers are stringified) and hands that raw string to the
 * `saveAnswer` server action on submit — `normalizeAnswerValue` on the
 * server is what turns it back into the real value.
 */
export function QuestionCard({
  question,
  index,
  total,
  initialValue,
  showInvalidNotice,
  timezoneOptions,
  saveAnswer,
}: QuestionCardProps) {
  const [rawValue, setRawValue] = useState(() => computeInitialRawValue(question, initialValue))
  const [error, setError] = useState<string | null>(
    showInvalidNotice ? 'This answer needs fixing before the interview can finish.' : null,
  )
  const [isPending, startTransition] = useTransition()

  const isLast = index === total - 1
  const canAdvance = !question.required || rawValue.trim().length > 0

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canAdvance) {
      setError('This one needs an answer before you can continue.')
      return
    }
    setError(null)
    startTransition(async () => {
      // A successful save redirects inside the server action, which throws
      // Next's navigation signal before this promise resolves with a value
      // — so `result` is only ever populated on a validation failure.
      const result = await saveAnswer(question.id, rawValue)
      if (!result.ok) {
        setError(result.message)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-[var(--color-text-muted)]">
          Question {index + 1} of {total}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {question.required ? 'Required' : 'Optional'}
        </span>
      </div>

      <h1 className="mt-3 font-display text-3xl">{question.prompt}</h1>
      <p className="mt-2 text-[var(--color-text-muted)]">{question.helper}</p>

      <div className="mt-8">
        <Label htmlFor="interview-answer" className="sr-only">
          {question.prompt}
        </Label>

        {question.input === 'text' && (
          <Input
            id="interview-answer"
            value={rawValue}
            onChange={(event) => setRawValue(event.target.value)}
            autoFocus
          />
        )}

        {question.input === 'textarea' && (
          <Textarea
            id="interview-answer"
            value={rawValue}
            onChange={(event) => setRawValue(event.target.value)}
            rows={5}
            autoFocus
          />
        )}

        {question.input === 'list' && (
          <Textarea
            id="interview-answer"
            value={rawValue}
            onChange={(event) => setRawValue(event.target.value)}
            rows={4}
            placeholder="One per line"
            autoFocus
          />
        )}

        {question.input === 'time' && (
          <Input
            id="interview-answer"
            type="time"
            value={rawValue}
            onChange={(event) => setRawValue(event.target.value)}
            className="w-40"
            autoFocus
          />
        )}

        {question.input === 'timezone' && (
          <select
            id="interview-answer"
            value={rawValue}
            onChange={(event) => setRawValue(event.target.value)}
            className={selectClassName}
          >
            {(timezoneOptions ?? []).map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        )}

        {question.input === 'choice' && (
          <div role="radiogroup" aria-label={question.prompt} className="flex flex-col gap-3">
            {(question.options ?? []).map((option) => {
              const optionValue = String(option.value)
              const checked = rawValue === optionValue
              return (
                <label
                  key={optionValue}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 text-sm transition-colors ${
                    checked
                      ? 'border-brand bg-brand/5'
                      : 'border-[var(--color-border)] hover:border-brand/50'
                  }`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={optionValue}
                    checked={checked}
                    onChange={() => setRawValue(optionValue)}
                    className="h-4 w-4 accent-[var(--color-brand)]"
                  />
                  {option.label}
                </label>
              )
            })}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-10 flex items-center justify-between">
        {index > 0 ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/onboarding/interview?q=${index - 1}`} />}
          >
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isLast ? 'Finish' : 'Next'}
        </Button>
      </div>
    </form>
  )
}
