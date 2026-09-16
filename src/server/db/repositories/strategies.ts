import 'server-only'
import type { Prisma } from '@prisma/client'
import type { Cadence, IsoDate } from '@/lib/strategy/schedule'
import type { ArcPhase, SlotFormat, SlotStatus } from '@/lib/strategy/vocabulary'
import { getPrisma } from '../client'

/**
 * Strategy data access (spec §4.2, §5): the strategy row, its pillars and
 * its slots, read and written together.
 *
 * Prisma bypasses row-level security. **Every exported function takes userId
 * first and scopes on it.** That is the authorization model. user_id is
 * denormalised onto pillars and slots for exactly this reason (see
 * supabase/migrations/0004_strategy.sql): a write that names a slot by id
 * still filters on user_id, so a guessed uuid cannot reach another
 * customer's row.
 *
 * The enum-like columns (`format`, `status`) mirror check constraints in the
 * database; their const tuples live in src/lib/strategy/vocabulary.ts so a
 * Client Component can read the labels without importing this `server-only`
 * module. Keep the two in step.
 *
 * `scheduled_on` and `starts_on` are `date` columns. Prisma hands them back
 * as a `Date` at UTC midnight; this module converts them to `'YYYY-MM-DD'`
 * strings at the boundary and back, so nothing above it ever holds a `Date`
 * it could format in the wrong timezone.
 */

export type Pillar = {
  id: string
  position: number
  name: string
  description: string
}

export type Slot = {
  id: string
  pillarId: string
  weekIndex: number
  position: number
  scheduledOn: IsoDate
  theme: string
  angle: string
  format: SlotFormat
  /** The one-line brief every slot carries from generation. */
  brief: string
  /** The full brief, written only when the slot's week is briefed. */
  hook: string | null
  keyPoints: string[]
  proofPoint: string | null
  cta: string | null
  status: SlotStatus
}

export type Strategy = {
  id: string
  userId: string
  version: number
  cadencePerWeek: Cadence
  startsOn: IsoDate
  positioning: string
  phases: Record<ArcPhase, string>
  weekThemes: string[]
  generatedAt: Date
  /** Ordered by position. */
  pillars: Pillar[]
  /** Ordered by week, then position. */
  slots: Slot[]
}

type PillarRow = {
  id: string
  position: number
  name: string
  description: string
}

type SlotRow = {
  id: string
  pillar_id: string
  week_index: number
  position: number
  scheduled_on: Date
  theme: string
  angle: string
  format: string
  brief: string
  hook: string | null
  key_points: string[]
  proof_point: string | null
  cta: string | null
  status: string
}

type StrategyRow = {
  id: string
  user_id: string
  version: number
  cadence_per_week: number
  starts_on: Date
  positioning: string
  phase_authority: string
  phase_problem_aware: string
  phase_offer_aware: string
  phase_invitation: string
  week_themes: string[]
  generated_at: Date
  pillars: PillarRow[]
  slots: SlotRow[]
}

function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`)
}

function toPillar(row: PillarRow): Pillar {
  return { id: row.id, position: row.position, name: row.name, description: row.description }
}

function toSlot(row: SlotRow): Slot {
  return {
    id: row.id,
    pillarId: row.pillar_id,
    weekIndex: row.week_index,
    position: row.position,
    scheduledOn: toIsoDate(row.scheduled_on),
    theme: row.theme,
    angle: row.angle,
    format: row.format as SlotFormat,
    brief: row.brief,
    hook: row.hook,
    keyPoints: row.key_points,
    proofPoint: row.proof_point,
    cta: row.cta,
    status: row.status as SlotStatus,
  }
}

function toStrategy(row: StrategyRow): Strategy {
  return {
    id: row.id,
    userId: row.user_id,
    version: row.version,
    // Narrowed by the check constraint cadence_per_week between 3 and 5.
    cadencePerWeek: row.cadence_per_week as Cadence,
    startsOn: toIsoDate(row.starts_on),
    positioning: row.positioning,
    phases: {
      authority: row.phase_authority,
      'problem-aware': row.phase_problem_aware,
      'offer-aware': row.phase_offer_aware,
      invitation: row.phase_invitation,
    },
    weekThemes: row.week_themes,
    generatedAt: row.generated_at,
    pillars: row.pillars.map(toPillar),
    slots: row.slots.map(toSlot),
  }
}

/** Pillars by position, slots by week then position -- the display order.
 * `satisfies` rather than `as const`: Prisma's `orderBy` type is a mutable
 * array, and `as const` would freeze it into a readonly tuple it rejects. */
const STRATEGY_INCLUDE = {
  pillars: { orderBy: { position: 'asc' } },
  slots: { orderBy: [{ week_index: 'asc' }, { position: 'asc' }] },
} satisfies Prisma.strategiesInclude

export async function getStrategy(userId: string): Promise<Strategy | null> {
  const row = await getPrisma().strategies.findUnique({
    where: { user_id: userId },
    include: STRATEGY_INCLUDE,
  })
  return row ? toStrategy(row) : null
}

/** A pillar as the generator produces it, before it has an id. */
export type NewPillar = {
  position: number
  name: string
  description: string
}

/** A slot as the generator produces it. Refers to its pillar by position,
 * because pillar ids do not exist until `replaceStrategy` creates them. */
export type NewSlot = {
  pillarPosition: number
  weekIndex: number
  position: number
  scheduledOn: IsoDate
  theme: string
  angle: string
  format: SlotFormat
  brief: string
}

/** Everything `generateStrategy` returns and `replaceStrategy` persists. */
export type StrategyDraft = {
  cadencePerWeek: Cadence
  startsOn: IsoDate
  positioning: string
  phases: Record<ArcPhase, string>
  weekThemes: string[]
  pillars: NewPillar[]
  slots: NewSlot[]
}

/**
 * Create the user's strategy, or replace it wholesale.
 *
 * One transaction: the old pillars and slots are deleted, the strategy row is
 * upserted with its version bumped (Ruling R-M3-7), the new pillars are
 * created, and the new slots are inserted with their pillar positions
 * resolved to the fresh ids. If anything in that sequence fails, the user
 * keeps the strategy they had rather than ending up with a strategy row and
 * no slots.
 *
 * The deletes are scoped on user_id even though the FK cascade would remove
 * the children anyway: the scope is the authorization model, and the cascade
 * is a database detail this function should not depend on to be safe.
 */
export async function replaceStrategy(userId: string, draft: StrategyDraft): Promise<Strategy> {
  return getPrisma().$transaction(async (tx) => {
    await tx.slots.deleteMany({ where: { user_id: userId } })
    await tx.pillars.deleteMany({ where: { user_id: userId } })

    const fields = {
      cadence_per_week: draft.cadencePerWeek,
      starts_on: fromIsoDate(draft.startsOn),
      positioning: draft.positioning,
      phase_authority: draft.phases.authority,
      phase_problem_aware: draft.phases['problem-aware'],
      phase_offer_aware: draft.phases['offer-aware'],
      phase_invitation: draft.phases.invitation,
      week_themes: draft.weekThemes,
      generated_at: new Date(),
    }

    const strategy = await tx.strategies.upsert({
      where: { user_id: userId },
      create: { user_id: userId, version: 1, ...fields },
      // Atomic increment, not read-then-write: two regenerates racing from
      // two tabs must not both land on the same version number.
      update: { version: { increment: 1 }, ...fields },
      select: { id: true, version: true },
    })

    // Sequential rather than createMany: createMany cannot return the ids,
    // and the slots below need them. Four or five rows, so the cost is nil.
    const pillarIdByPosition = new Map<number, string>()
    for (const pillar of draft.pillars) {
      const created = await tx.pillars.create({
        data: {
          strategy_id: strategy.id,
          user_id: userId,
          position: pillar.position,
          name: pillar.name,
          description: pillar.description,
        },
        select: { id: true },
      })
      pillarIdByPosition.set(pillar.position, created.id)
    }

    const slotRows = draft.slots.map((slot) => {
      const pillarId = pillarIdByPosition.get(slot.pillarPosition)
      if (!pillarId) {
        // The generator validates pillar indices before this runs; reaching
        // here means a bug upstream, and throwing rolls the transaction back
        // rather than inserting a slot the FK would reject anyway.
        throw new Error(
          `Slot week ${slot.weekIndex} position ${slot.position} names pillar ${slot.pillarPosition}, which does not exist`,
        )
      }
      return {
        strategy_id: strategy.id,
        user_id: userId,
        pillar_id: pillarId,
        week_index: slot.weekIndex,
        position: slot.position,
        scheduled_on: fromIsoDate(slot.scheduledOn),
        theme: slot.theme,
        angle: slot.angle,
        format: slot.format,
        brief: slot.brief,
      }
    })

    await tx.slots.createMany({ data: slotRows })

    const row = await tx.strategies.findUniqueOrThrow({
      where: { user_id: userId },
      include: STRATEGY_INCLUDE,
    })
    return toStrategy(row)
  })
}

/** The full brief for one slot, as `draftWeek` produces it. */
export type SlotBrief = {
  slotId: string
  hook: string
  keyPoints: string[]
  proofPoint: string | null
  cta: string
}

/**
 * Write the full briefs for a week's slots and mark them `briefed`.
 *
 * Each update filters on BOTH id and user_id -- a slot id the caller got
 * from somewhere else cannot reach another user's row -- and the return
 * value is the number of rows actually updated, so a caller can tell "the
 * scope filtered everything out" from success. Runs in one transaction so a
 * week is briefed whole or not at all.
 */
export async function saveSlotBriefs(userId: string, briefs: SlotBrief[]): Promise<number> {
  if (briefs.length === 0) return 0

  return getPrisma().$transaction(async (tx) => {
    let updated = 0
    for (const brief of briefs) {
      const result = await tx.slots.updateMany({
        where: { id: brief.slotId, user_id: userId },
        data: {
          hook: brief.hook,
          key_points: brief.keyPoints,
          proof_point: brief.proofPoint,
          cta: brief.cta,
          status: 'briefed',
        },
      })
      updated += result.count
    }
    return updated
  })
}

/** The dashboard's "next scheduled slot" (spec §6 band one). */
export async function getNextSlot(
  userId: string,
  onOrAfter: IsoDate,
): Promise<(Slot & { pillarName: string }) | null> {
  const row = await getPrisma().slots.findFirst({
    where: { user_id: userId, scheduled_on: { gte: fromIsoDate(onOrAfter) } },
    orderBy: { scheduled_on: 'asc' },
    include: { pillars: { select: { name: true } } },
  })
  if (!row) return null
  return { ...toSlot(row), pillarName: row.pillars.name }
}

