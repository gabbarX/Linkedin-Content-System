import 'server-only'
import type { VoiceProfile } from '@/server/db/repositories/voice-profiles'
import type { WritingSample } from '@/server/db/repositories/writing-samples'
import { describeVoice } from '@/server/strategy/prompt-context'

/**
 * The parts of the voice profile the strategy does not render, and the
 * exemplars, assembled for a prompt that writes actual prose.
 *
 * `@/server/strategy/prompt-context` describes the business, the taboos and
 * the judged voice fields, and is reused as-is so the writer and the planner
 * describe the same person the same way. But it deliberately stops there: the
 * strategy decides *angles*, and how many line breaks somebody uses does not
 * affect an angle. Writing the post does depend on it, so the measured and
 * policy fields are added here rather than pushed down into the shared module
 * where they would be dead weight on five strategy calls.
 *
 * Emoji and hashtag policy are rendered as instructions rather than labels,
 * because "emojiPolicy: none" invites a model to reason about the label while
 * "do not use any emoji" does not.
 */

const EMOJI_RULE = {
  none: 'Use no emoji at all. Not one.',
  sparing: 'At most one or two emoji in the whole post, and only where this person would use one.',
  frequent: 'Emoji are part of how this person writes; use them as they do.',
} as const

const HASHTAG_RULE = {
  none: 'Use no hashtags.',
  sparing: 'At most two hashtags, at the very end.',
  frequent: 'Three to five hashtags at the end, as this person uses them.',
} as const

const LINE_BREAK_RULE = {
  'single-line': 'They write in single lines with blank lines between them. Almost every line stands alone.',
  grouped: 'They write in short groups of two or three lines, separated by blank lines.',
  dense: 'They write in fuller paragraphs of four or more lines.',
} as const

/**
 * Everything about *how* this person writes, as opposed to what they think.
 * Built on the strategy's `describeVoice` so the judged fields cannot drift
 * between the two callers.
 */
export function describeVoiceForWriting(voice: VoiceProfile): string {
  const lines = [describeVoice(voice), '', 'How the text must be shaped:']

  lines.push(`- ${LINE_BREAK_RULE[voice.lineBreakStyle]}`)
  lines.push(`- ${EMOJI_RULE[voice.emojiPolicy]}`)
  lines.push(`- ${HASHTAG_RULE[voice.hashtagPolicy]}`)

  if (voice.avgSentenceLength !== null) {
    const longest =
      voice.maxSentenceLength !== null
        ? ` Their longest sentences run to about ${voice.maxSentenceLength} words; do not exceed that.`
        : ''
    lines.push(
      `- Their sentences average about ${Math.round(voice.avgSentenceLength)} words.${longest}`,
    )
  }
  if (voice.avgParagraphLines !== null) {
    lines.push(
      `- Their paragraphs average about ${voice.avgParagraphLines.toFixed(1)} lines.`,
    )
  }

  if (voice.bannedPhrases.length > 0) {
    lines.push(
      `- Never write any of these phrases, in any form: ${voice.bannedPhrases.join(', ')}.`,
    )
  }

  return lines.join('\n')
}

/**
 * The user's own posts, quoted whole, as the model's reference for voice.
 *
 * Quoted rather than summarised: the point of an exemplar is the actual
 * rhythm, and a description of a rhythm is not one. They are labelled as
 * reference material and explicitly not as content to reuse, because a model
 * handed three of someone's posts will otherwise cheerfully rewrite one.
 */
export function describeExemplars(samples: readonly WritingSample[]): string {
  if (samples.length === 0) {
    return 'No sample posts are available. Follow the voice description above exactly.'
  }

  const quoted = samples.map(
    (sample, index) => `--- SAMPLE ${index + 1} ---\n${sample.content.trim()}`,
  )

  return [
    `${samples.length} post${samples.length === 1 ? '' : 's'} this person actually wrote, as a reference for rhythm, sentence length and how they open and close. Match the voice. Do NOT reuse their sentences, their examples or their stories — this post is about something else:`,
    '',
    ...quoted,
  ].join('\n')
}
