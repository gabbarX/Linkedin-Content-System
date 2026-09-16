import {
  INTERVIEW_QUESTIONS,
  interviewAnswersSchema,
  questionAt,
  type InterviewAnswers,
  type InterviewField,
  type InterviewQuestion,
} from './questions'

/**
 * Pure logic behind the interview wizard's persistence — everything that can
 * be tested without a database or a browser. Nothing here talks to
 * `profiles` or `business_profiles`; `src/app/(app)/onboarding/interview/actions.ts`
 * is the only thing that does, and it is built entirely out of these
 * functions plus the two repositories.
 *
 * Kept free of `server-only` imports (same reasoning as `questions.ts` and
 * `steps.ts`): nothing here is Client-Component-hostile, so there is no
 * reason to force it to be.
 */

/** Mirrors `InterviewDraft` from the profiles repository — declared locally
 * rather than imported, so this module (and anything importing it) stays
 * decoupled from the `server-only` repository layer. Structurally identical;
 * TypeScript checks it at the actions.ts call sites. */
export type InterviewDraftValue = string | string[] | number
export type InterviewDraft = Record<string, InterviewDraftValue>

/**
 * Reserved draft key holding the furthest question index the user has
 * advanced past. Not a schema field — `interviewAnswersSchema.safeParse`
 * silently strips keys it doesn't recognise, so this never reaches
 * `business_profiles` or `profiles`. It exists solely so that reopening
 * `/onboarding/interview` with no `?q=` resumes at the right screen instead
 * of restarting at question 0, even though a skipped optional question is
 * deliberately *not* stored under its own field (see `normalizeAnswerValue`).
 */
const POSITION_KEY = '_position'

/** The furthest-along question index recorded in `draft`, clamped to a valid
 * index. Defaults to 0 for a fresh or missing draft. */
export function resumeIndexFromDraft(draft: InterviewDraft | null): number {
  const raw = draft?.[POSITION_KEY]
  const maxIndex = INTERVIEW_QUESTIONS.length - 1
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return 0
  return Math.min(raw, maxIndex)
}

/**
 * Normalizes whatever a question's input widget posted into the value that
 * belongs in the draft, or `undefined` when an optional question was left
 * blank.
 *
 * `undefined` matters, not just "falsy": `interviewAnswersSchema`'s optional
 * string fields (`priceBand`, `proof`, `pointOfView`, `ctaTarget`) accept a
 * missing key but reject an empty string as a present-but-invalid value —
 * verified against the schema (`z.string().trim().min(1).optional()`). So a
 * skipped optional question must be OMITTED from the draft entirely, never
 * stored as `''`, or the final validation would fail on a question the user
 * was allowed to leave blank.
 */
export function normalizeAnswerValue(
  question: InterviewQuestion,
  rawValue: string | string[],
): string | string[] | number | undefined {
  if (question.input === 'list') {
    // The list widget is a textarea, one item per line, so a single string
    // is split on newlines; an already-split array (e.g. from a test) is
    // taken as-is. [] is itself a valid final value for taboos (no min
    // length on the array), never a "skip" sentinel — so it is always
    // returned, never turned into `undefined`.
    const items = Array.isArray(rawValue) ? rawValue : rawValue.split('\n')
    return items.map((item) => item.trim()).filter((item) => item.length > 0)
  }

  const single = (Array.isArray(rawValue) ? rawValue[0] : rawValue)?.trim() ?? ''

  if (question.field === 'cadencePerWeek') {
    if (single.length === 0) return undefined
    const parsed = Number(single)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return single.length > 0 ? single : undefined
}

/**
 * Applies one answer to a draft, returning a new draft object rather than
 * mutating `draft`. `value === undefined` (an optional question left blank)
 * removes the field instead of writing an empty value — see
 * `normalizeAnswerValue`. `position` is always recorded, so a blank optional
 * answer still moves the resume point forward.
 */
export function applyDraftAnswer(
  draft: InterviewDraft,
  field: InterviewField,
  value: string | string[] | number | undefined,
  position: number,
): InterviewDraft {
  const next: InterviewDraft = { ...draft, [POSITION_KEY]: position }
  if (value === undefined) {
    delete next[field]
  } else {
    next[field] = value
  }
  return next
}

export type DraftValidation =
  | { success: true; answers: InterviewAnswers }
  | { success: false; firstInvalidIndex: number; firstInvalidField: InterviewField }

/**
 * Validates a (supposedly) finished draft against `interviewAnswersSchema`.
 * On failure, resolves the earliest question — in interview order, not
 * schema-issue order — whose field caused the failure, so the wizard can
 * send the user back there instead of stranding them on a dead final
 * screen with answers that look complete but cannot be saved.
 */
export function validateDraft(draft: InterviewDraft): DraftValidation {
  const result = interviewAnswersSchema.safeParse(draft)
  if (result.success) return { success: true, answers: result.data }

  const invalidFields = new Set(
    result.error.issues
      .map((issue) => issue.path[0])
      .filter((segment): segment is string => typeof segment === 'string'),
  )

  const fallbackQuestion = questionAt(0)
  if (!fallbackQuestion) {
    // INTERVIEW_QUESTIONS is a non-empty module-level constant (11
    // questions), so this never actually throws -- but earning that fact
    // this way, rather than an `as InterviewQuestion` cast (I3/M6), means
    // the type stays honest about what `questionAt` can return everywhere
    // else it's called.
    throw new Error('INTERVIEW_QUESTIONS is unexpectedly empty')
  }
  const firstInvalidQuestion: InterviewQuestion =
    INTERVIEW_QUESTIONS.find((q) => invalidFields.has(q.field)) ?? fallbackQuestion
  const firstInvalidField = firstInvalidQuestion.field
  const firstInvalidIndex = INTERVIEW_QUESTIONS.findIndex((q) => q.field === firstInvalidField)

  return {
    success: false,
    firstInvalidIndex: firstInvalidIndex === -1 ? 0 : firstInvalidIndex,
    firstInvalidField,
  }
}

/**
 * `profiles.preferred_post_time` is a Postgres `time` column, modelled by
 * Prisma as `DateTime` — `updateProfile` takes a `Date`. Converting in UTC
 * (`Z` suffix) is load-bearing: converting via local time would shift the
 * stored hour by the server's own offset, invisible on a machine that
 * happens to run UTC. Verified fact: an existing row storing `08:00` reads
 * back as `1970-01-01T08:00:00Z`.
 */
export function hhmmToDate(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`)
}

export type BusinessProfileAnswers = {
  offer: string
  icp: string
  transformation: string
  priceBand?: string
  proof?: string
  pointOfView?: string
  taboos?: string[]
  ctaTarget?: string
}

export type ProfileAnswers = {
  cadencePerWeek: 3 | 4 | 5
  preferredPostTime: Date
  timezone: string
}

export type SplitAnswers = {
  businessProfile: BusinessProfileAnswers
  profile: ProfileAnswers
}

/**
 * Splits a validated set of interview answers into the two persistence
 * calls the wizard's final advance makes.
 *
 * Built as explicit literals from `answers` -- itself already validated
 * against `interviewAnswersSchema`, so every field read below is a real,
 * type-checked property of `InterviewAnswers` -- rather than assembled into
 * loosely-typed records and force-cast to `BusinessProfileAnswers` /
 * `ProfileAnswers` at the end (I3). The previous `as unknown as ...` casts
 * claimed `cadencePerWeek: 3 | 4 | 5` and `preferredPostTime: Date` with no
 * type-level or runtime evidence; a future `profiles`-bound field could have
 * compiled while being silently dropped. Listing every field here by name
 * means the compiler -- not a cast -- is what enforces that
 * `BusinessProfileAnswers` and `ProfileAnswers` are actually populated:
 * omitting a required field from either literal below is a type error, not
 * a runtime surprise.
 *
 * Optional business-profile fields are added with a conditional spread
 * (`...(x !== undefined && { x })`) rather than always assigning, because
 * `businessProfile.priceBand = undefined` would still leave the key present
 * -- and `upsertBusinessProfile` (and this module's own test suite) rely on
 * a genuinely absent key, not one holding `undefined`.
 */
export function splitAnswersForPersistence(answers: InterviewAnswers): SplitAnswers {
  const businessProfile: BusinessProfileAnswers = {
    offer: answers.offer,
    icp: answers.icp,
    transformation: answers.transformation,
    taboos: answers.taboos,
    ...(answers.priceBand !== undefined && { priceBand: answers.priceBand }),
    ...(answers.proof !== undefined && { proof: answers.proof }),
    ...(answers.pointOfView !== undefined && { pointOfView: answers.pointOfView }),
    ...(answers.ctaTarget !== undefined && { ctaTarget: answers.ctaTarget }),
  }

  const profile: ProfileAnswers = {
    cadencePerWeek: answers.cadencePerWeek,
    preferredPostTime: hhmmToDate(answers.preferredPostTime),
    timezone: answers.timezone,
  }

  return { businessProfile, profile }
}
