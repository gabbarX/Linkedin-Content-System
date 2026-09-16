import { z } from 'zod'

/**
 * The guided interview, as data — spec §4.1.
 *
 * `INTERVIEW_QUESTIONS` is the single source of truth for the nine topics the
 * interview covers: their prompts, help text, input widgets, and where each
 * answer is ultimately stored. Two consumers read it:
 *
 * 1. The onboarding wizard — one question per screen, in array order, driving
 *    its own progress indicator.
 * 2. A later settings form (Milestone 3+) that edits the same business
 *    profile fields as a plain form, not a wizard. It renders every question
 *    at once instead of one at a time; nothing here assumes a wizard is the
 *    only consumer, which is why prompts, helper text and validation live
 *    here rather than in a wizard component.
 *
 * Nothing here talks to the database. `FIELD_COLUMNS` records where an answer
 * eventually lands so that mapping is declared once and is testable, but
 * writing it there is a job for the repositories in `src/server/db`.
 */

/** How a question collects its answer. */
export type InterviewInputType =
  | 'text'
  | 'textarea'
  | 'list'
  | 'choice'
  | 'time'
  | 'timezone'

export type InterviewOption = {
  /** cadencePerWeek needs real numbers here (see the 3-5 check constraint on
   * profiles.cadence_per_week) — hence `string | number` rather than just
   * `string`. */
  value: string | number
  label: string
}

/**
 * The nine topics from spec §4.1, in the order the interview asks them.
 * "Offer and price band" and "preferred posting time and timezone" are each
 * one topic answered by two questions (two different columns, two different
 * input widgets), so this list has 9 entries while `INTERVIEW_QUESTIONS` has
 * 11 — see the topic field on each question below.
 */
export const INTERVIEW_TOPICS = [
  'offer-and-price-band',
  'icp',
  'transformation',
  'proof-and-results',
  'point-of-view',
  'taboos',
  'cta-target',
  'cadence',
  'posting-time-and-timezone',
] as const

export type InterviewTopic = (typeof INTERVIEW_TOPICS)[number]

/**
 * Every question's answer, keyed by field. This is the type both the
 * wizard's in-progress state and a finished, validated interview share.
 * `interviewAnswersSchema` (below) is the runtime enforcement of this shape;
 * this type is inferred from it so the two can never drift apart.
 */
export const interviewAnswersSchema = z.object({
  offer: z.string().trim().min(1, 'Describe your offer.'),
  priceBand: z.string().trim().min(1).optional(),
  icp: z.string().trim().min(1, 'Describe who this is for.'),
  transformation: z.string().trim().min(1, "Describe what changes for the client."),
  proof: z.string().trim().min(1).optional(),
  pointOfView: z.string().trim().min(1).optional(),
  // business_profiles.taboos is `text[] not null default '{}'` — always an
  // array, never absent, so this defaults rather than being optional.
  taboos: z.array(z.string().trim().min(1)).default([]),
  ctaTarget: z.string().trim().min(1).optional(),
  // profiles.cadence_per_week has a database check constraint of 3-5.
  cadencePerWeek: z.literal([3, 4, 5]),
  // profiles.preferred_post_time is a `time` column; 24-hour HH:mm keeps the
  // wizard's <input type="time"> value and the stored value identical.
  preferredPostTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm, e.g. 08:00.'),
  timezone: z.string().trim().min(1, 'Choose a timezone.'),
})

export type InterviewAnswers = z.infer<typeof interviewAnswersSchema>

/** Every field an answer can target. Fixed to the schema's keys, so a typo
 * in a question's `field` is a compile error rather than a silent gap. */
export type InterviewField = keyof InterviewAnswers

export type InterviewQuestion = {
  id: string
  topic: InterviewTopic
  prompt: string
  helper: string
  field: InterviewField
  input: InterviewInputType
  required: boolean
  options?: InterviewOption[]
}

/**
 * Where each answer field is persisted. `business_profiles.offer`, `.icp`
 * and `.transformation` are NOT NULL; everything else on that table is
 * nullable. `profiles.cadence_per_week`, `.preferred_post_time` and
 * `.timezone` all carry defaults, but the interview still asks for them
 * deliberately (spec §4.1: asking later means a broken first week).
 */
export const FIELD_COLUMNS: Record<
  InterviewField,
  { table: 'business_profiles' | 'profiles'; column: string }
> = {
  offer: { table: 'business_profiles', column: 'offer' },
  priceBand: { table: 'business_profiles', column: 'price_band' },
  icp: { table: 'business_profiles', column: 'icp' },
  transformation: { table: 'business_profiles', column: 'transformation' },
  proof: { table: 'business_profiles', column: 'proof' },
  pointOfView: { table: 'business_profiles', column: 'point_of_view' },
  taboos: { table: 'business_profiles', column: 'taboos' },
  ctaTarget: { table: 'business_profiles', column: 'cta_target' },
  cadencePerWeek: { table: 'profiles', column: 'cadence_per_week' },
  preferredPostTime: { table: 'profiles', column: 'preferred_post_time' },
  timezone: { table: 'profiles', column: 'timezone' },
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'offer',
    topic: 'offer-and-price-band',
    prompt: "What's the core offer you sell?",
    helper:
      "Describe it the way you'd explain it to a stranger at a conference — the service or program itself, not just the topic you post about.",
    field: 'offer',
    input: 'textarea',
    required: true,
  },
  {
    id: 'priceBand',
    topic: 'offer-and-price-band',
    prompt: "What's the price band for that offer?",
    helper:
      'A range is fine — "$4k-8k per engagement" or "$1,500/mo retainer". This never appears in a post; it keeps proof points and CTAs calibrated to who can actually afford you.',
    field: 'priceBand',
    input: 'text',
    required: false,
  },
  {
    id: 'icp',
    topic: 'icp',
    prompt: 'Who is this for?',
    helper:
      'Name the specific buyer — role, company stage or size, the situation they\'re in — not "business owners". The narrower this is, the sharper every draft reads.',
    field: 'icp',
    input: 'textarea',
    required: true,
  },
  {
    id: 'transformation',
    topic: 'transformation',
    prompt: 'What changes in their business after working with you?',
    helper:
      'Describe the change in the client\'s business, not the deliverable you hand over. "Fewer support tickets and a team that ships without them" is a transformation; "a 12-week coaching program" is not.',
    field: 'transformation',
    input: 'textarea',
    required: true,
  },
  {
    id: 'proof',
    topic: 'proof-and-results',
    prompt: 'What proof do you have that it works?',
    helper:
      'Client results, before/after numbers, a case study, a strong testimonial — whatever you\'d point to if someone asked "does this actually work?"',
    field: 'proof',
    input: 'textarea',
    required: false,
  },
  {
    id: 'pointOfView',
    topic: 'point-of-view',
    prompt: 'What do you believe about your industry that most people in it get wrong?',
    helper:
      "A contrarian or unpopular opinion you actually hold. This is what gives your posts a point of view instead of reading like everyone else's advice.",
    field: 'pointOfView',
    input: 'textarea',
    required: false,
  },
  {
    id: 'taboos',
    topic: 'taboos',
    prompt: 'Any topics you refuse to post about?',
    helper:
      "Politics, a past employer, client names, a competitor by name — anything that's off-limits no matter how relevant it seems.",
    field: 'taboos',
    input: 'list',
    required: false,
  },
  {
    id: 'ctaTarget',
    topic: 'cta-target',
    prompt: 'Where should an interested reader end up?',
    helper:
      'A call-booking link, a DM, your newsletter, your site — the one place you want a post\'s call to action to point.',
    field: 'ctaTarget',
    input: 'text',
    required: false,
  },
  {
    id: 'cadence',
    topic: 'cadence',
    prompt: 'How many posts a week do you want to commit to?',
    helper:
      "Pick what you can sustain for 12 weeks, not your best week. Daily posting isn't offered on purpose — it's the plan people abandon in week two.",
    field: 'cadencePerWeek',
    input: 'choice',
    required: true,
    options: [
      { value: 3, label: '3 posts a week — steady and sustainable' },
      { value: 4, label: '4 posts a week' },
      { value: 5, label: '5 posts a week — an aggressive pace' },
    ],
  },
  {
    id: 'preferredPostTime',
    topic: 'posting-time-and-timezone',
    prompt: 'What time should a draft be ready for your approval?',
    helper:
      "Pick the time of day you're actually likely to open LinkBud and tap approve — the job that sends your approval nudge runs off this.",
    field: 'preferredPostTime',
    input: 'time',
    required: true,
  },
  {
    id: 'timezone',
    topic: 'posting-time-and-timezone',
    prompt: 'What timezone are you in?',
    helper: 'Approval nudges and the posting schedule are both built around this.',
    field: 'timezone',
    input: 'timezone',
    required: true,
  },
]

/** The question at `index`, or `undefined` past either end of the array. */
export function questionAt(index: number): InterviewQuestion | undefined {
  return INTERVIEW_QUESTIONS[index]
}
