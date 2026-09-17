import 'server-only'
import { z } from 'zod'
import { LINKEDIN_CHAR_LIMIT } from '@/lib/post/vocabulary'
import type { BusinessProfile } from '@/server/db/repositories/business-profiles'
import type { VoiceProfile } from '@/server/db/repositories/voice-profiles'
import { LlmError } from '@/server/llm/client'
import { createFallbackSession, type FallbackSession } from '@/server/llm/complete-with-fallback'
import { describeTaboos } from '@/server/strategy/prompt-context'
import { describeVoiceForWriting } from './prompt-context'
import type { Brief } from './build-brief'

/**
 * `polish(post, voice) -> Post` from spec §4.4: one optional revision pass
 * against an explicit rubric — voice match, hook strength, offer relevance,
 * LinkedIn formatting.
 *
 * Single pass, never a loop. A model asked to improve its own output twice
 * produces something smoother and less like the person who is supposed to have
 * written it, and each pass is another call billed to us.
 *
 * **The result never overwrites the user's text here.** It comes back and the
 * caller stores it as a pending polish for the user to accept or discard
 * (Ruling R-M5-4 / Q4). Ten minutes of someone's editing must not vanish on a
 * tap they cannot undo, and which way they went is itself a preference signal.
 */

const polishSchema = z.object({
  post: z.string(),
})

const SYSTEM = `You are editing one finished LinkedIn post for a solo B2B coach or consultant. The text you are given is theirs — they wrote or edited it — so your job is to improve it, not to replace it.

Judge it against exactly four things, in this order:

1. Voice match. Does it sound like the person described below? Sentence length, rhythm, how it opens and closes, the words they actually reach for. This is the one that matters most: a smoother post in the wrong voice is a worse post.
2. Hook strength. Do the first two lines earn the tap on "see more"? Everything after roughly 210 characters is hidden until the reader chooses to expand.
3. Offer relevance. Does it connect to what this person sells, without pitching? A post that could have been written by any consultant is a wasted slot.
4. LinkedIn formatting. Short paragraphs, deliberate blank lines, no markdown — LinkedIn renders none of it.

Rules:
- Keep the author's argument, their examples and their facts. You may cut, tighten, reorder and resharpen. You may not introduce a new claim, a new number, a new client or a new result.
- Keep their voice. If a sentence is clumsy but characteristic, leave it.
- Do not make it longer unless it is genuinely too thin. Cutting is usually the improvement.
- Never touch an off-limits topic.
- Never mention price.
- Stay under ${LINKEDIN_CHAR_LIMIT} characters.
- Return the complete edited post as plain text in the "post" field. No commentary, no explanation of what you changed, no surrounding quotation marks.`

export type PolishInput = {
  text: string
  business: BusinessProfile
  voice: VoiceProfile
  brief: Brief
  llm?: FallbackSession
}

export async function polish({
  text,
  business,
  voice,
  brief,
  llm = createFallbackSession(),
}: PolishInput): Promise<string> {
  const user = [
    'THEIR VOICE',
    describeVoiceForWriting(voice),
    '',
    describeTaboos(business),
    '',
    'WHAT THIS POST IS FOR',
    `Angle: ${brief.angle}`,
    `Call to action: ${brief.cta}`,
    brief.proofPoint
      ? `The only proof this post may use: ${brief.proofPoint}`
      : 'This post has no proof point. Do not add one.',
    '',
    'THE POST TO EDIT',
    text,
  ].join('\n')

  const result = await llm.complete({
    system: SYSTEM,
    user,
    schema: polishSchema,
    schemaName: 'polished_post',
  })

  const polished = result.post.trim()
  if (polished.length === 0) {
    throw new LlmError(
      "The model's reply did not match the expected shape — the polished post came back empty",
    )
  }
  return polished
}
