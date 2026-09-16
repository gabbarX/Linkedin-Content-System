/**
 * The strategy vocabulary — spec §4.2.
 *
 * This module is the client-safe home for the const tuples the database's
 * check constraints mirror (`supabase/migrations/0004_strategy.sql`), in
 * the same way `src/lib/onboarding/steps.ts` holds the onboarding step
 * vocabulary: domain knowledge, not data access. The repository
 * (`src/server/db/repositories/strategies.ts`, `server-only`) imports from
 * here rather than the other way round, so a Client Component can read
 * `PHASE_META` and `FORMAT_META` for labels without dragging `server-only`
 * into its bundle. This file must therefore import nothing from
 * `@/server/**`.
 *
 * Keep every tuple in step with the migration: a value that type-checks but
 * violates the constraint fails at runtime with 23514, which is a worse
 * error than a compile failure and arrives much later.
 */

export const WEEKS_IN_STRATEGY = 12

/** Spec §4.2: 4–5 content pillars. */
export const MIN_PILLARS = 4
export const MAX_PILLARS = 5

/**
 * The narrative arc, in order: authority → problem-aware → offer-aware →
 * invitation. Three weeks each (Ruling R-M3-3). The phase of a slot is
 * derived from its week index by `phaseForWeek`, never stored per slot.
 */
export const ARC_PHASES = ['authority', 'problem-aware', 'offer-aware', 'invitation'] as const
export type ArcPhase = (typeof ARC_PHASES)[number]

const WEEKS_PER_PHASE = WEEKS_IN_STRATEGY / ARC_PHASES.length

export const PHASE_META: Record<
  ArcPhase,
  { label: string; weeks: [number, number]; purpose: string }
> = {
  authority: {
    label: 'Authority',
    weeks: [1, 3],
    purpose:
      'Earn the right to be read. Show expertise and point of view on the problems the ideal client already recognises, without mentioning the offer.',
  },
  'problem-aware': {
    label: 'Problem-aware',
    weeks: [4, 6],
    purpose:
      "Name the problem precisely. Make the reader see the cost of the situation they are in and why the usual fixes fail, so they feel understood before they are sold to.",
  },
  'offer-aware': {
    label: 'Offer-aware',
    weeks: [7, 9],
    purpose:
      'Show the way out. Introduce how the transformation happens — the method, the proof, the before and after — so the offer becomes the obvious next step without a hard pitch.',
  },
  invitation: {
    label: 'Invitation',
    weeks: [10, 12],
    purpose:
      'Ask. Make the call to action direct and specific, remove the last objections, and give the reader a reason to act this week.',
  },
}

/** The arc phase a week belongs to. Throws outside 1..12 — a caller with a
 * week index it cannot place has a bug, and a silent default would hide it. */
export function phaseForWeek(weekIndex: number): ArcPhase {
  if (!Number.isInteger(weekIndex) || weekIndex < 1 || weekIndex > WEEKS_IN_STRATEGY) {
    throw new RangeError(`weekIndex must be an integer in 1..${WEEKS_IN_STRATEGY}, got ${weekIndex}`)
  }
  const phase = ARC_PHASES[Math.floor((weekIndex - 1) / WEEKS_PER_PHASE)]
  if (!phase) {
    // Unreachable given the range check above; satisfies
    // noUncheckedIndexedAccess without a non-null assertion.
    throw new RangeError(`No phase for week ${weekIndex}`)
  }
  return phase
}

/** The week indices (1-based) a phase covers, ascending. */
export function weeksForPhase(phase: ArcPhase): number[] {
  const [first, last] = PHASE_META[phase].weeks
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}

/**
 * Post formats. Text-only (spec §2: v1 is text-only until CMA approval), so
 * these are structural shapes of a text post — the same features
 * Milestone 5's exemplar matching selects on (list vs narrative, opener
 * type), not media types.
 */
export const SLOT_FORMATS = ['story', 'how-to', 'list', 'contrarian', 'case-study', 'question'] as const
export type SlotFormat = (typeof SLOT_FORMATS)[number]

export const FORMAT_META: Record<SlotFormat, { label: string; description: string }> = {
  story: {
    label: 'Story',
    description: 'A first-person narrative with a turn and a lesson.',
  },
  'how-to': {
    label: 'How-to',
    description: 'A practical, step-by-step walk through one thing the reader can do.',
  },
  list: {
    label: 'List',
    description: 'A numbered or bulleted set of points on one theme.',
  },
  contrarian: {
    label: 'Contrarian take',
    description: 'A clear challenge to a belief the reader probably holds.',
  },
  'case-study': {
    label: 'Case study',
    description: 'One client or situation, the before, what changed, the after.',
  },
  question: {
    label: 'Question',
    description: 'A short set-up that ends by asking the reader something specific.',
  },
}

/**
 * A slot's lifecycle in this milestone: laid out (`planned`), then briefed
 * in full (`briefed`) when its week comes up. Milestone 5 adds the post
 * states in a new migration; this tuple mirrors the check constraint as
 * it stands.
 */
export const SLOT_STATUSES = ['planned', 'briefed'] as const
export type SlotStatus = (typeof SLOT_STATUSES)[number]
