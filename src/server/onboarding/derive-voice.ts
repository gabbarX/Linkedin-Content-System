import 'server-only'
import { z } from 'zod'
import { completeJsonWithFallback as completeJson } from '@/server/llm/complete-with-fallback'
import {
  FORMALITIES,
  HUMOUR_LEVELS,
  POV_STRENGTHS,
  SENTENCE_RHYTHMS,
  type DerivedVoiceProfile,
} from '@/server/db/repositories/voice-profiles'
import { measureSamples } from './measure-samples'

/**
 * Derive a Voice Profile from a writer's pasted samples (spec §4.1).
 *
 * Arithmetic and judgement are kept apart on purpose (spec §8, amended):
 *
 *   * Measured fields -- avgSentenceLength, maxSentenceLength,
 *     avgParagraphLines, lineBreakStyle, emojiPolicy, hashtagPolicy -- come
 *     from measureSamples() and always win when this is merged with the
 *     model's output. Nothing here asks a model to count.
 *   * Judged fields -- sentenceRhythm, povStrength, humourLevel, formality,
 *     vocabularyMarkers, openerPatterns, closerPatterns, bannedPhrases --
 *     are the only things asked of the model, because they are not
 *     arithmetic: whether a POV reads as "contrarian" is a judgement call.
 *
 * The judgement schema below is sent to the gateway as JSON Schema and
 * validated on the way back (see completeJson), so a model cannot invent an
 * enum value the database's check constraints would reject. The enums are
 * imported from the repository module rather than retyped, so this can never
 * drift from what's stored on-disk.
 */

const judgementSchema = z.object({
  sentence_rhythm: z.enum(SENTENCE_RHYTHMS),
  pov_strength: z.enum(POV_STRENGTHS),
  humour_level: z.enum(HUMOUR_LEVELS),
  formality: z.enum(FORMALITIES),
  vocabulary_markers: z.array(z.string()),
  opener_patterns: z.array(z.string()),
  closer_patterns: z.array(z.string()),
  banned_phrases: z.array(z.string()),
})

const SYSTEM_PROMPT = `You are analysing a LinkedIn writer's own past posts to describe their voice, for an assistant that will later draft new posts in that voice.

You will be given several writing samples, pasted by the writer themselves. Judge only the qualities listed below and return nothing else.

- sentence_rhythm: "short-punchy" (mostly short, declarative sentences), "varied" (a mix of short and long), or "long-flowing" (mostly long, multi-clause sentences).
- pov_strength: "measured" (hedged, qualified opinions), "balanced" (clear opinions, open to nuance), or "contrarian" (bold, deliberately challenges consensus).
- humour_level: "none", "dry" (understated, deadpan), or "playful" (overtly light, jokes).
- formality: "formal", "conversational", or "casual".
- vocabulary_markers: distinctive words or short phrases this writer reaches for repeatedly (their vocabulary, not generic LinkedIn language). Return only words or phrases you actually saw, at most 10.
- opener_patterns: the KINDS of opening move this writer uses, e.g. "contrarian claim", "personal anecdote", "direct question to the reader", "blunt statistic". Name the pattern. Never quote the sample text verbatim.
- closer_patterns: the KINDS of closing move this writer uses, e.g. "call to action", "open question", "one-line summary", "no explicit close". Name the pattern. Never quote the sample text verbatim.
- banned_phrases: generic LinkedIn clichés (e.g. "game-changer", "let that sink in", "I'm humbled to announce") that this writer visibly avoids across every sample. Only include a phrase if its absence is notable given the topic -- an empty list is a valid answer.

Base every judgement only on the samples given. Do not invent detail that is not supported by the text.`

function buildUserPrompt(samples: string[]): string {
  return [
    'Writing samples, each pasted by the writer:',
    ...samples.map((sample, index) => `--- Sample ${index + 1} ---\n${sample}`),
  ].join('\n\n')
}

/**
 * Derive a whole Voice Profile: measured fields from measureSamples(),
 * judged fields from one model call, merged into the shape saveVoiceProfile
 * writes to the database.
 */
export async function deriveVoiceProfile(samples: string[]): Promise<DerivedVoiceProfile> {
  if (samples.length === 0) {
    throw new Error('deriveVoiceProfile requires at least one writing sample.')
  }

  const measurements = measureSamples(samples)

  const judgement = await completeJson({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(samples),
    schema: judgementSchema,
    schemaName: 'voice_profile_judgement',
  })

  return {
    // Measured -- always from measureSamples(), never the model.
    avgSentenceLength: measurements.avgSentenceLength,
    maxSentenceLength: measurements.maxSentenceLength,
    avgParagraphLines: measurements.avgParagraphLines,
    lineBreakStyle: measurements.lineBreakStyle,
    emojiPolicy: measurements.emojiPolicy,
    hashtagPolicy: measurements.hashtagPolicy,
    // Judged -- from the model.
    sentenceRhythm: judgement.sentence_rhythm,
    povStrength: judgement.pov_strength,
    humourLevel: judgement.humour_level,
    formality: judgement.formality,
    openerPatterns: judgement.opener_patterns,
    closerPatterns: judgement.closer_patterns,
    vocabularyMarkers: judgement.vocabulary_markers,
    bannedPhrases: judgement.banned_phrases,
  }
}
