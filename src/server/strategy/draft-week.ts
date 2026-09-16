import 'server-only'
import { z } from 'zod'
import type { BusinessProfile } from '@/server/db/repositories/business-profiles'
import type { SlotBrief, Strategy } from '@/server/db/repositories/strategies'
import type { VoiceProfile } from '@/server/db/repositories/voice-profiles'
import { LlmError } from '@/server/llm/client'
import { createFallbackSession, type FallbackSession } from '@/server/llm/complete-with-fallback'
import { FORMAT_META, PHASE_META, phaseForWeek } from '@/lib/strategy/vocabulary'
import { describeBusiness, describeTaboos, describeVoice } from './prompt-context'

/**
 * `draftWeek(strategy, weekIndex) -> Slot[]` from spec §4.2: brief one
 * week's slots in full.
 *
 * "In full" means a full brief, not a post (Ruling R-M3-4): the hook
 * direction, the key points, the proof to lean on and the call to action —
 * everything Milestone 5's writer needs to produce three variants without
 * re-deciding what the post is for. Post text is generated behind the
 * paywall (spec §1.2); the strategy, including this week's briefs, is
 * delivered free.
 *
 * One model call for the week (3–5 slots). Returns `SlotBrief[]` keyed by
 * slot id for `saveSlotBriefs`; nothing here writes to the database, so a
 * failure costs only the call and the strategy itself is untouched.
 *
 * `llm` lets the caller share one fallback session with `generateStrategy`
 * so a provider just observed down on the plan is not re-proven for another
 * 90 s here; a lone call gets its own session.
 */

const briefsSchema = z.object({
  briefs: z.array(
    z.object({
      position: z.number().int(),
      hook: z.string(),
      key_points: z.array(z.string()),
      /** Empty string when nothing in the profile fits -- a plain string
       * rather than `string | null`, so the wire schema stays a single
       * type; mapped to null below. */
      proof_point: z.string(),
      cta: z.string(),
    }),
  ),
})

const SYSTEM = `You are briefing a ghostwriter who will draft LinkedIn posts for a solo B2B coach or consultant. You will be given the coach's business and voice profiles, the phase of the plan this week sits in, and this week's post slots — each with a theme, an angle, a format and a one-line brief.

For each slot, return a full brief the writer can draft from without asking questions:

- position: the slot's position number, exactly as given.
- hook: the direction for the first line or two — what it must do to stop the scroll (a claim, a question, a scene, a number). Describe the move; do not write the finished line.
- key_points: two to four points the body must make, in order, each one sentence. Specific to this coach's profile, not generic advice.
- proof_point: which piece of the coach's own proof (from the profile) this post should lean on, and how. Return an empty string if nothing in the profile fits — never invent proof.
- cta: what the post asks the reader to do at the end, consistent with the phase (authority posts ask for little; invitation posts ask directly) and pointing at the coach's CTA target where the phase calls for it.

Respect the voice profile — the brief should suit how this person actually writes. Never touch an off-limits topic. Return exactly one brief per slot.`

function buildPrompt(
  strategy: Strategy,
  business: BusinessProfile,
  voice: VoiceProfile,
  weekIndex: number,
  slots: Strategy['slots'],
): string {
  const phase = phaseForWeek(weekIndex)
  const pillarName = (pillarId: string) =>
    strategy.pillars.find((pillar) => pillar.id === pillarId)?.name ?? 'Unnamed pillar'
  return [
    `THE PLAN — positioning: ${strategy.positioning}`,
    `Phase: ${PHASE_META[phase].label} (${PHASE_META[phase].purpose})`,
    `This phase for this coach: ${strategy.phases[phase]}`,
    `Week ${weekIndex} theme: ${strategy.weekThemes[weekIndex - 1] ?? ''}`,
    '',
    'THIS WEEK’S SLOTS',
    ...slots.map((slot) =>
      [
        `Position ${slot.position} — pillar: ${pillarName(slot.pillarId)}`,
        `  theme: ${slot.theme}`,
        `  angle: ${slot.angle}`,
        `  format: ${slot.format} (${FORMAT_META[slot.format].description})`,
        `  brief: ${slot.brief}`,
      ].join('\n'),
    ),
    '',
    'BUSINESS PROFILE',
    describeBusiness(business),
    '',
    describeTaboos(business),
    '',
    'VOICE PROFILE',
    describeVoice(voice),
    '',
    `Return exactly ${slots.length} briefs, positions ${slots.map((slot) => slot.position).join(', ')}.`,
  ].join('\n')
}

export async function draftWeek(
  strategy: Strategy,
  business: BusinessProfile,
  voice: VoiceProfile,
  weekIndex: number,
  llm: FallbackSession = createFallbackSession(),
): Promise<SlotBrief[]> {
  const slots = strategy.slots.filter((slot) => slot.weekIndex === weekIndex)
  if (slots.length === 0) {
    throw new Error(`Strategy ${strategy.id} has no slots in week ${weekIndex}`)
  }

  const result = await llm.complete({
    system: SYSTEM,
    user: buildPrompt(strategy, business, voice, weekIndex, slots),
    schema: briefsSchema,
    schemaName: 'week_briefs',
  })

  // One brief per slot, matched on position. Missing or duplicated
  // positions are a shape failure like any other; a surplus brief for a
  // position that does not exist is ignored.
  const byPosition = new Map<number, (typeof result.briefs)[number]>()
  for (const brief of result.briefs) {
    if (!byPosition.has(brief.position)) byPosition.set(brief.position, brief)
  }

  return slots.map((slot) => {
    const brief = byPosition.get(slot.position)
    if (!brief) {
      throw new LlmError(
        `The model's reply did not match the expected shape — no brief for week ${weekIndex} position ${slot.position}`,
      )
    }
    const hook = brief.hook.trim()
    const cta = brief.cta.trim()
    if (hook.length === 0 || cta.length === 0) {
      throw new LlmError(
        `The model's reply did not match the expected shape — week ${weekIndex} position ${slot.position} has a blank hook or CTA`,
      )
    }
    const proofPoint = brief.proof_point.trim()
    return {
      slotId: slot.id,
      hook,
      keyPoints: brief.key_points.map((point) => point.trim()).filter((point) => point.length > 0),
      proofPoint: proofPoint.length > 0 ? proofPoint : null,
      cta,
    }
  })
}
