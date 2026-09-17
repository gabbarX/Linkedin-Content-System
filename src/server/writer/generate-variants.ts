import 'server-only'
import { z } from 'zod'
import { APPROACH_META, LINKEDIN_CHAR_LIMIT, VARIANT_APPROACHES } from '@/lib/post/vocabulary'
import type { VariantApproach } from '@/lib/post/vocabulary'
import { countCharacters } from '@/lib/post/measure'
import { FORMAT_META, type SlotFormat } from '@/lib/strategy/vocabulary'
import type { BusinessProfile } from '@/server/db/repositories/business-profiles'
import type { VoiceProfile } from '@/server/db/repositories/voice-profiles'
import type { WritingSample } from '@/server/db/repositories/writing-samples'
import { LlmError } from '@/server/llm/client'
import { createFallbackSession, type FallbackSession } from '@/server/llm/complete-with-fallback'
import { describeBusiness, describeTaboos } from '@/server/strategy/prompt-context'
import { describeExemplars, describeVoiceForWriting } from './prompt-context'
import type { Brief } from './build-brief'

/**
 * `generateVariants(brief, voice) -> Variant[3]` from spec §4.4.
 *
 * Three drafts, generated in parallel from one shared brief. The shared brief
 * is what keeps all three on-strategy instead of producing three unrelated
 * posts.
 *
 * **The three are not three samples of one prompt** (Ruling R-M5-2). Each
 * carries a named approach — hook-forward, story-forward, proof-forward — and
 * the approach is stored with the draft. That is what makes "which one did the
 * user pick" a signal Milestone 9 can learn from: index 1 means the same thing
 * on every post ever generated. Three rolls of one prompt would make the index
 * meaningless and the three panes look arbitrary to the user.
 *
 * **Prompt shape is deliberate, and it is the caching mechanism.** Everything
 * stable — the voice, the business, the exemplars, the brief — goes in the
 * system prompt, byte-identical across all three calls. Only a single
 * approach instruction varies, and it goes in the user message. That is
 * precisely the prefix a provider's implicit caching keys on, which is how the
 * roadmap's "provider-appropriate prompt caching so the Voice Profile context
 * is not re-billed on every variant" is satisfied without adding a cache API,
 * a TTL or a second code path for a provider that does not support one.
 * Reordering these so the varying part comes first would silently disable it.
 *
 * Nothing here writes to the database.
 */

const variantSchema = z.object({
  post: z.string(),
})

export type Variant = {
  variantIndex: number
  approach: VariantApproach
  content: string
}

const SYSTEM_RULES = `You are ghostwriting a LinkedIn post for a solo B2B coach or consultant. You will be given their business, their voice, examples of their real writing, and a brief for this one post.

Return the finished post as plain text in the "post" field. Rules:

- Write the post itself. No preamble, no title, no "Here is your post", no surrounding quotation marks, no markdown headings, no bold or italic markers — LinkedIn renders none of them.
- Write in this person's voice, not a generic LinkedIn voice. The samples are the reference.
- Use blank lines the way this person does. Line breaks carry the rhythm on LinkedIn.
- Make every one of the brief's key points, in order.
- Use ONLY the proof supplied in the brief. Never invent a number, a client, a company or a result. If the brief supplies no proof, write the post without any.
- Never touch an off-limits topic, even obliquely.
- Never mention price.
- Never open with "In today's fast-paced world", "Let me tell you", "Here's the thing" or any variation. Never end with a question the reader cannot answer from what they just read.
- Stay under ${LINKEDIN_CHAR_LIMIT} characters. The first two lines matter most: everything after roughly 210 characters is hidden behind "see more" until the reader taps.`

/**
 * The cacheable prefix: identical for all three calls in a generation.
 */
export function buildVariantSystem(
  business: BusinessProfile,
  voice: VoiceProfile,
  exemplars: readonly WritingSample[],
  brief: Brief,
  format: SlotFormat,
): string {
  return [
    SYSTEM_RULES,
    '',
    'THE COACH',
    describeBusiness(business),
    '',
    describeTaboos(business),
    '',
    'THEIR VOICE',
    describeVoiceForWriting(voice),
    '',
    'THEIR OWN WRITING',
    describeExemplars(exemplars),
    '',
    'THE BRIEF FOR THIS POST',
    `Format: ${FORMAT_META[format].label} — ${FORMAT_META[format].description}`,
    `Angle: ${brief.angle}`,
    `Hook direction: ${brief.hook}`,
    `Key points, in order:\n${brief.keyPoints.map((point) => `- ${point}`).join('\n')}`,
    brief.proofPoint
      ? `Proof to lean on: ${brief.proofPoint}`
      : 'Proof: none from the profile fits this post. Do not invent any.',
    `Call to action: ${brief.cta}`,
  ].join('\n')
}

export type GenerateVariantsInput = {
  business: BusinessProfile
  voice: VoiceProfile
  exemplars: readonly WritingSample[]
  brief: Brief
  format: SlotFormat
  /** Shared with the brief call before it, so a provider observed down is not
   *  re-proven three more times. */
  llm?: FallbackSession
}

export async function generateVariants({
  business,
  voice,
  exemplars,
  brief,
  format,
  llm = createFallbackSession(),
}: GenerateVariantsInput): Promise<Variant[]> {
  const system = buildVariantSystem(business, voice, exemplars, brief, format)

  // Parallel, on one shared session — the same fan-out shape as
  // generateStrategy's four phase calls. All-or-nothing: if one fails the
  // caller gets the throw and nothing is written, because two drafts where
  // the user was promised three is worse than a retry.
  const results = await Promise.all(
    VARIANT_APPROACHES.map((approach) =>
      llm.complete({
        system,
        user: `Approach for this draft: ${APPROACH_META[approach].instruction}`,
        schema: variantSchema,
        schemaName: 'post_variant',
      }),
    ),
  )

  return results.map((result, index) => {
    const approach = VARIANT_APPROACHES[index]
    const content = result.post.trim()
    if (approach === undefined) {
      // Unreachable: index comes from mapping over VARIANT_APPROACHES itself.
      // Narrowed rather than asserted, because `!` is banned and this costs
      // nothing.
      throw new LlmError('The writer lost track of which approach it was generating')
    }
    if (content.length === 0) {
      throw new LlmError(
        `The model's reply did not match the expected shape — the ${APPROACH_META[approach].label} draft came back empty`,
      )
    }
    return { variantIndex: index, approach, content }
  })
}

/** Exported for the editor's "this one is over the limit" hint. */
export function isOverLimit(content: string): boolean {
  return countCharacters(content) > LINKEDIN_CHAR_LIMIT
}
