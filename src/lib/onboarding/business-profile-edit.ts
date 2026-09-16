import { z } from 'zod'
import {
  FIELD_COLUMNS,
  INTERVIEW_QUESTIONS,
  interviewAnswersSchema,
  type InterviewField,
  type InterviewQuestion,
} from './questions'

/**
 * The Business Profile editor's pure logic (Task 10, Ruling R5).
 *
 * `INTERVIEW_QUESTIONS` is the single source of business-profile field
 * definitions -- prompts, helper text, input widgets -- shared with the
 * onboarding wizard (`src/app/(app)/onboarding/interview/`). This module
 * does not redeclare any of that; it only narrows the 11 interview
 * questions down to the 8 that land on `business_profiles` (per
 * `FIELD_COLUMNS`), and maps between that subset's answers and the plain
 * settings form this page renders as one page instead of a wizard.
 *
 * `cadencePerWeek`, `preferredPostTime` and `timezone` are deliberately
 * excluded here: they persist to `profiles`, not `business_profiles`, and
 * this page is the *business profile* editor, not a general settings
 * surface for every interview answer -- the relevant interfaces this task
 * was handed (`BusinessProfileInput`, `upsertBusinessProfile`) only ever
 * touch the 8 `business_profiles` columns. Posting cadence and schedule are
 * a different settings concern for whichever page ends up owning them.
 *
 * Kept free of `server-only` imports (same reasoning as `interview-draft.ts`
 * and `voice-edit.ts`'s own doc comment about *not* doing this): unlike
 * `voice-edit.ts`, nothing here needs a database enum tuple, so there is no
 * reason to force this module off a Client Component's import graph.
 * `BusinessProfileLike` below is declared locally, structurally identical
 * to `BusinessProfile` from `@/server/db/repositories/business-profiles`,
 * rather than imported from it -- so this module (and the client form
 * component that reads `BUSINESS_PROFILE_QUESTIONS` from it at runtime)
 * never touches the `server-only` repository layer, directly or via types.
 */

/** The subset of `InterviewField` that lands on `business_profiles`. */
export type BusinessProfileField = Exclude<
  InterviewField,
  'cadencePerWeek' | 'preferredPostTime' | 'timezone'
>

export type BusinessProfileQuestion = InterviewQuestion & { field: BusinessProfileField }

/**
 * `INTERVIEW_QUESTIONS`, narrowed to the 8 that persist to
 * `business_profiles`, in interview order. A type predicate (rather than an
 * `as` cast) is what lets `question.field` below be typed as
 * `BusinessProfileField` for every question in this array -- CLAUDE.md: no
 * cast used merely to quiet the compiler.
 */
export const BUSINESS_PROFILE_QUESTIONS: BusinessProfileQuestion[] = INTERVIEW_QUESTIONS.filter(
  (question): question is BusinessProfileQuestion =>
    FIELD_COLUMNS[question.field].table === 'business_profiles',
)

/** Everything the settings form submits: every field as a plain string (or
 * string array, for taboos) the way a text input or textarea posts it --
 * mirrors `VoiceFormValues`'s reasoning in `voice-edit.ts`. */
export type BusinessProfileFormValues = {
  offer: string
  priceBand: string
  icp: string
  transformation: string
  proof: string
  pointOfView: string
  taboos: string[]
  ctaTarget: string
}

/** Structurally identical to `BusinessProfile` (minus `userId` and the two
 * timestamps, which the form never shows or edits) -- declared locally so
 * this module stays decoupled from the `server-only` repository layer. See
 * the module doc comment above. */
export type BusinessProfileLike = {
  offer: string
  priceBand: string | null
  icp: string
  transformation: string
  proof: string | null
  pointOfView: string | null
  taboos: string[]
  ctaTarget: string | null
}

/** The form's blank state -- also what a user with no `business_profiles`
 * row yet (interview never finished) sees: an empty form, not a redirect.
 * `upsertBusinessProfile` already creates the row on first save (its own
 * doc comment: "the same form serves onboarding and the later settings
 * editor"), so there is nothing else this page needs to special-case. */
export function businessProfileToFormValues(
  profile: BusinessProfileLike | null,
): BusinessProfileFormValues {
  return {
    offer: profile?.offer ?? '',
    priceBand: profile?.priceBand ?? '',
    icp: profile?.icp ?? '',
    transformation: profile?.transformation ?? '',
    proof: profile?.proof ?? '',
    pointOfView: profile?.pointOfView ?? '',
    taboos: profile?.taboos ?? [],
    ctaTarget: profile?.ctaTarget ?? '',
  }
}

/**
 * The same validation the interview applies to these 8 fields, reused
 * rather than re-specified -- `.pick` narrows `interviewAnswersSchema`
 * (the single source, per Ruling R5) to exactly the business-profile
 * subset, so a required-field message, a trim rule, or a future check
 * added to the interview schema is never silently absent here.
 */
const businessProfileSchema = interviewAnswersSchema.pick({
  offer: true,
  priceBand: true,
  icp: true,
  transformation: true,
  proof: true,
  pointOfView: true,
  taboos: true,
  ctaTarget: true,
})

/** Inferred from the schema above rather than hand-declared, so the two can
 * never drift -- matches `BusinessProfileInput`'s shape (optional fields
 * accept `string | undefined`). */
export type BusinessProfileEdit = z.infer<typeof businessProfileSchema>

export type BusinessProfileFormParseResult =
  | { success: true; edit: BusinessProfileEdit }
  | { success: false; message: string }

/** Runtime shape check for the one array field. The UI only ever builds
 * `taboos` by splitting a text box, but a server action is a public HTTP
 * endpoint -- same reasoning as `isStringArray` in `voice-edit.ts`. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

type ScalarReadResult = { ok: true; trimmed: string } | { ok: false; message: string }

/**
 * Validates-and-trims one scalar field, or fails with a typed rejection.
 *
 * `BusinessProfileFormValues` types every scalar field as `string`, but a
 * server action is a public HTTP endpoint -- a crafted POST can send
 * `null`, a number, or anything else JSON allows, and TypeScript's types do
 * not survive to runtime. Calling `.trim()` on that unchecked value is
 * exactly the class of bug three previous reviews on this branch found in
 * other fields (an array-shape check present for one field, absent for the
 * rest): this helper is the one place every scalar field goes through, so
 * a field added to `BUSINESS_PROFILE_QUESTIONS` tomorrow is guarded by
 * construction -- the loop below calls this for every question it iterates,
 * not by a caller remembering to add a check for the new field.
 */
function readTrimmedScalar(value: unknown, question: BusinessProfileQuestion): ScalarReadResult {
  if (typeof value !== 'string') {
    return { ok: false, message: `The "${question.id}" field must be text.` }
  }
  return { ok: true, trimmed: value.trim() }
}

/**
 * Validates a submitted form against the same rules the interview enforces
 * on these 8 fields, and maps it to a `BusinessProfileEdit` ready for
 * `upsertBusinessProfile`.
 *
 * Blank optional fields are omitted before validation, not passed through
 * as `''` -- `interviewAnswersSchema`'s optional string fields accept a
 * missing key but reject an empty string as present-but-invalid (same
 * reasoning as `normalizeAnswerValue` in `interview-draft.ts`), so passing
 * `''` through would make every optional field in this form impossible to
 * leave blank. Required fields are always included (even blank), so the
 * schema's own required-field message -- not this function's generic one --
 * is what a genuinely blank required field sees.
 */
export function parseBusinessProfileFormValues(
  values: BusinessProfileFormValues,
): BusinessProfileFormParseResult {
  if (!isStringArray(values.taboos)) {
    return { success: false, message: 'Taboos must be a list of text.' }
  }

  const candidate: Record<string, string | string[]> = {
    taboos: values.taboos.map((item) => item.trim()).filter((item) => item.length > 0),
  }

  for (const question of BUSINESS_PROFILE_QUESTIONS) {
    if (question.field === 'taboos') continue

    const raw: unknown = values[question.field]
    const read = readTrimmedScalar(raw, question)
    if (!read.ok) return { success: false, message: read.message }

    if (question.required || read.trimmed.length > 0) {
      candidate[question.field] = read.trimmed
    }
  }

  const result = businessProfileSchema.safeParse(candidate)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return {
      success: false,
      message: firstIssue?.message ?? 'Some of this could not be saved. Check each field.',
    }
  }

  return { success: true, edit: result.data }
}
