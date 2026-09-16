import 'server-only'
import { z } from 'zod'
import { LlmError } from '@/server/llm/client'
import type { NewSlot } from '@/server/db/repositories/strategies'
import { scheduleSlots, type Cadence, type IsoDate } from '@/lib/strategy/schedule'
import { SLOT_FORMATS, WEEKS_IN_STRATEGY } from '@/lib/strategy/vocabulary'

/**
 * The seam between what the model said about a phase's weeks and the dated
 * slots the repository writes (Ruling R-M3-1, R-M3-2).
 *
 * The model is asked for exactly `cadence` slots per week and a pillar
 * number in 1..N. It is a model, so:
 *
 *   * a week with MORE slots than the cadence is truncated -- the surplus
 *     is discarded, deterministically, and the plan stays at 12 × cadence;
 *   * a week with FEWER slots throws -- there is nothing honest to fill the
 *     gap with, and a retry is cheap;
 *   * a pillar number outside 1..N throws -- it would be a dangling FK;
 *   * dates come from `scheduleSlots`, never from the model. It was not
 *     asked for them and would not be trusted if it offered.
 *
 * Every failure is an `LlmError` so the caller's error handling treats it
 * exactly like a malformed reply from the gateway -- which is what it is.
 */

/**
 * One week of slots as the phase call returns it. Shared with the generator
 * so the wire schema is declared exactly once. Count and range rules are
 * enforced here, in code, rather than as `minItems`/`minimum` in the schema:
 * `.refine()` emits nothing into the JSON Schema sent to the provider (see
 * completeJson), so the request stays inside what strict mode accepts.
 */
export const weekOutputSchema = z.object({
  week_index: z.number().int(),
  slots: z.array(
    z.object({
      pillar: z.number().int(),
      theme: z.string(),
      angle: z.string(),
      format: z.enum(SLOT_FORMATS),
      brief: z.string(),
    }),
  ),
})

export type WeekOutput = z.infer<typeof weekOutputSchema>

export function assembleSlots(
  weeks: WeekOutput[],
  pillarCount: number,
  cadence: Cadence,
  startsOn: IsoDate,
): NewSlot[] {
  const byWeek = new Map<number, WeekOutput>()
  for (const week of weeks) {
    // First occurrence wins if the model repeats a week; a duplicate is a
    // model quirk, not a reason to fail a plan that is otherwise complete.
    if (!byWeek.has(week.week_index)) byWeek.set(week.week_index, week)
  }

  const schedule = scheduleSlots(startsOn, cadence)
  const result: NewSlot[] = []

  for (let weekIndex = 1; weekIndex <= WEEKS_IN_STRATEGY; weekIndex++) {
    const week = byWeek.get(weekIndex)
    if (!week) {
      throw new LlmError(`The model's reply did not match the expected shape — week ${weekIndex} is missing`)
    }
    if (week.slots.length < cadence) {
      throw new LlmError(
        `The model's reply did not match the expected shape — week ${weekIndex} has ${week.slots.length} slots, expected ${cadence}`,
      )
    }

    const dated = schedule.filter((s) => s.weekIndex === weekIndex)
    week.slots.slice(0, cadence).forEach((slot, index) => {
      const date = dated[index]
      if (!date) {
        // scheduleSlots always yields exactly `cadence` dates per week, so
        // this is unreachable; it satisfies noUncheckedIndexedAccess without
        // a non-null assertion.
        throw new Error(`No scheduled date for week ${weekIndex} position ${index + 1}`)
      }
      if (!Number.isInteger(slot.pillar) || slot.pillar < 1 || slot.pillar > pillarCount) {
        throw new LlmError(
          `The model's reply did not match the expected shape — week ${weekIndex} names pillar ${slot.pillar}, expected 1..${pillarCount}`,
        )
      }
      const theme = slot.theme.trim()
      if (theme.length === 0) {
        throw new LlmError(
          `The model's reply did not match the expected shape — week ${weekIndex} position ${index + 1} has a blank theme`,
        )
      }
      result.push({
        pillarPosition: slot.pillar,
        weekIndex,
        position: date.position,
        scheduledOn: date.scheduledOn,
        theme,
        angle: slot.angle.trim(),
        format: slot.format,
        brief: slot.brief.trim(),
      })
    })
  }

  return result
}
