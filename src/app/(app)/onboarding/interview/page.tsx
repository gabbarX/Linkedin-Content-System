import { redirect } from 'next/navigation'
import { ProgressDots } from '@/components/onboarding/progress-dots'
import { QuestionCard } from '@/components/onboarding/question-card'
import { resumeIndexFromDraft } from '@/lib/onboarding/interview-draft'
import { INTERVIEW_QUESTIONS, questionAt } from '@/lib/onboarding/questions'
import { createServerClient } from '@/lib/supabase/server'
import { getInterviewDraft } from '@/server/db/repositories/profiles'
import { saveAnswer } from './actions'

type InterviewPageProps = {
  searchParams: Promise<{ q?: string; invalid?: string }>
}

/**
 * One question per screen. The question index lives in the URL (`?q=3`) so
 * the browser's own Back button works and a refresh does not restart the
 * interview; the answers themselves live in `profiles.interview_draft`, so
 * closing the tab does not either.
 *
 * With no `?q=` at all (e.g. the user reopens the bare
 * `/onboarding/interview` after closing the tab), this resumes at the
 * furthest question the draft records rather than restarting at 0 — see
 * `resumeIndexFromDraft`. An out-of-range `?q=` (stale link, hand-edited
 * URL) is treated the same way rather than rendering a blank screen.
 */
export default async function InterviewPage({ searchParams }: InterviewPageProps) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // (app)/layout.tsx already redirects an unauthenticated request; this is
  // the same defensive re-check (app)/(onboarded)/layout.tsx makes, and this
  // page needs user.id regardless to load the draft.
  if (!user) redirect('/login')

  const draft = (await getInterviewDraft(user.id)) ?? {}
  const { q, invalid } = await searchParams

  const total = INTERVIEW_QUESTIONS.length
  const parsed = Number(q)
  const inBounds = Number.isInteger(parsed) && parsed >= 0 && parsed < total
  if (!inBounds) {
    redirect(`/onboarding/interview?q=${resumeIndexFromDraft(draft)}`)
  }

  const index = parsed
  const question = questionAt(index)
  if (!question) {
    // Unreachable given the bounds check above (index is a validated integer
    // in [0, total)); satisfies noUncheckedIndexedAccess at questionAt's
    // callsite without a non-null assertion.
    redirect('/onboarding/interview?q=0')
  }

  const initialValue = draft[question.field]
  const timezoneOptions =
    question.input === 'timezone' ? Intl.supportedValuesOf('timeZone') : undefined

  return (
    <div className="py-10">
      <ProgressDots current={index} total={total} />
      <div className="mt-8">
        <QuestionCard
          key={question.id}
          question={question}
          index={index}
          total={total}
          initialValue={initialValue}
          showInvalidNotice={invalid === '1'}
          timezoneOptions={timezoneOptions}
          saveAnswer={saveAnswer}
        />
      </div>
    </div>
  )
}
