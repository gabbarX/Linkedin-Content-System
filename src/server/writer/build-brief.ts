import 'server-only'
import { z } from 'zod'
import { phaseForWeek, PHASE_META, FORMAT_META } from '@/lib/strategy/vocabulary'
import type { BusinessProfile } from '@/server/db/repositories/business-profiles'
import type { Slot, Strategy } from '@/server/db/repositories/strategies'
import type { VoiceProfile } from '@/server/db/repositories/voice-profiles'
import { LlmError } from '@/server/llm/client'
import { createFallbackSession, type FallbackSession } from '@/server/llm/complete-with-fallback'
import { describeBusiness, describeTaboos } from '@/server/strategy/prompt-context'

/**
 * `buildBrief(slot, ctx) -> Brief` from spec §4.4: turn a slot into a tight
 * brief the three variants are all written from.
 *
 * **This is a model call** (Ruling R-M5-1), and it is worth being clear about
 * why, because it is not obvious. `draftWeek` already wrote a hook direction,
 * key points, proof and CTA onto the slot, so an assembly-only version of this
 * function was the cheaper design and was seriously considered. The decision
 * went the other way: the week's brief is written for a whole week at once, in
 * one call covering three to five slots, and this pass gives one post its own
 * attention.
 *
 * Two consequences follow, and both are load-bearing:
 *
 *   * **The slot's stored brief goes in, and the prompt forbids changing the
 *     angle or the CTA target.** The user has already read this plan on
 *     `/strategy`. If this call were free to re-decide what the post is about,
 *     the post would quietly stop matching the plan they approved, and nobody
 *     would be able to point at where it diverged.
 *   * **The result is persisted before the variants are generated**, by the
 *     caller (Ruling R-M5-9), so a variant failure does not re-bill this.
 *
 * Nothing here writes to the database. It returns a plain object and the
 * caller decides what to do with it — the same shape as `generateStrategy`.
 */

const briefSchema = z.object({
  angle: z.string(),
  hook: z.string(),
  key_points: z.array(z.string()),
  /** Empty string when nothing in the profile fits, mapped to null below. */
  proof_point: z.string(),
  cta: z.string(),
})

export type Brief = {
  angle: string
  hook: string
  keyPoints: string[]
  proofPoint: string | null
  cta: string
}

const SYSTEM = `You are briefing a ghostwriter who is about to draft one LinkedIn post for a solo B2B coach or consultant.

You will be given the coach's business profile, their voice profile, where this post sits in a twelve-week plan, and the plan's own brief for this slot.

Your job is to sharpen that brief for one post, not to rethink it. Return:

- angle: the single argument this post makes, in one sentence. This must be the SAME argument as the slot's angle. Sharpen the wording; never change the position, the topic or the side being argued.
- hook: what the first line or two must DO to stop the scroll — a claim, a question, a scene, a number. Describe the move. Do not write the finished line; the drafts do that.
- key_points: two to four points the body must make, in order, each one sentence. Specific to this coach's profile, not generic advice.
- proof_point: which piece of the coach's own proof this post should lean on, and how. Return an empty string if nothing in the profile fits. NEVER invent a number, a client or a result.
- cta: what the post asks the reader to do at the end. This must point at the SAME destination as the slot's call to action. You may sharpen the wording; you may not send the reader somewhere else.

Hard rules:
- Never touch an off-limits topic, even obliquely.
- Never contradict the coach's stated point of view.
- Never mention price.`

function buildPrompt(
  strategy: Strategy,
  slot: Slot,
  business: BusinessProfile,
  pillarName: string,
): string {
  const phase = phaseForWeek(slot.weekIndex)
  const weekTheme = strategy.weekThemes[slot.weekIndex - 1] ?? ''

  const lines = [
    'THE COACH',
    describeBusiness(business),
    '',
    describeTaboos(business),
    '',
    'THEIR POSITIONING',
    strategy.positioning,
    '',
    'WHERE THIS POST SITS',
    `Week ${slot.weekIndex} of 12, in the "${phase}" phase.`,
    `What that phase is for: ${PHASE_META[phase].purpose}`,
    `How this phase reads for this coach: ${strategy.phases[phase]}`,
    weekTheme ? `This week's theme: ${weekTheme}` : null,
    `Content pillar: ${pillarName}`,
    '',
    'THE SLOT, AS THE PLAN DEFINES IT — the angle and the CTA destination below are fixed',
    `Theme: ${slot.theme}`,
    `Angle: ${slot.angle}`,
    `Format: ${FORMAT_META[slot.format].label} — ${FORMAT_META[slot.format].description}`,
    `One-line brief: ${slot.brief}`,
    slot.hook ? `Hook direction already agreed: ${slot.hook}` : null,
    slot.keyPoints.length > 0
      ? `Key points already agreed:\n${slot.keyPoints.map((point) => `- ${point}`).join('\n')}`
      : null,
    slot.proofPoint
      ? `Proof already chosen: ${slot.proofPoint}`
      : 'No proof point was chosen for this slot. If nothing in the profile fits, return an empty proof_point rather than inventing one.',
    slot.cta ? `Call to action already agreed: ${slot.cta}` : null,
  ].filter((line): line is string => line !== null)

  return lines.join('\n')
}

export type BuildBriefInput = {
  strategy: Strategy
  slot: Slot
  business: BusinessProfile
  voice: VoiceProfile
  pillarName: string
  /** Shared with the variant calls that follow, so a provider observed down
   *  here is not re-proven there. */
  llm?: FallbackSession
}

export async function buildBrief({
  strategy,
  slot,
  business,
  pillarName,
  llm = createFallbackSession(),
}: BuildBriefInput): Promise<Brief> {
  const result = await llm.complete({
    system: SYSTEM,
    user: buildPrompt(strategy, slot, business, pillarName),
    schema: briefSchema,
    schemaName: 'post_brief',
  })

  // Zod's .min() and .refine() emit nothing into JSON Schema, so the provider
  // never saw these rules. Checked here, before anything is written — same
  // reasoning as assemble.ts.
  const angle = result.angle.trim()
  const hook = result.hook.trim()
  const cta = result.cta.trim()
  if (angle.length === 0 || hook.length === 0 || cta.length === 0) {
    throw new LlmError(
      "The model's reply did not match the expected shape — the brief has a blank angle, hook or call to action",
    )
  }

  const keyPoints = result.key_points
    .map((point) => point.trim())
    .filter((point) => point.length > 0)
  if (keyPoints.length === 0) {
    throw new LlmError(
      "The model's reply did not match the expected shape — the brief has no key points",
    )
  }

  const proofPoint = result.proof_point.trim()

  return {
    angle,
    hook,
    keyPoints,
    proofPoint: proofPoint.length > 0 ? proofPoint : null,
    cta,
  }
}
