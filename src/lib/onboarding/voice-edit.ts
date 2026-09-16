import {
  FORMALITIES,
  FREQUENCIES,
  HUMOUR_LEVELS,
  LINE_BREAK_STYLES,
  POV_STRENGTHS,
  SENTENCE_RHYTHMS,
  type Formality,
  type Frequency,
  type HumourLevel,
  type LineBreakStyle,
  type PovStrength,
  type SentenceRhythm,
  type VoiceProfileEdit,
} from '@/server/db/repositories/voice-profiles'

/**
 * The Voice Profile editor's pure logic (Task 9, spec §4.1): the option
 * catalogue behind each select, and the form -> `VoiceProfileEdit` mapping
 * with its enum safety net.
 *
 * This module value-imports `@/server/db/repositories/voice-profiles`,
 * which starts with `import 'server-only'` -- so importing this module
 * (not just its types) anywhere a Client Component's bundle can reach is a
 * build failure, by design. That is why `src/components/onboarding/
 * voice-editor.tsx` only ever does `import type` from here: type-only
 * imports are erased by TypeScript and never pull the runtime module (or
 * its `server-only` guard) into the client bundle. The runtime values
 * (`*_OPTIONS`, `parseVoiceFormValues`) are read only from
 * `src/app/(app)/onboarding/voice/page.tsx` and `actions.ts` -- both
 * server-side -- and from this file's own test.
 *
 * Unlike `interview-draft.ts` and `samples.ts`, which stay free of
 * `server-only` so a Client Component can share their validation directly,
 * this module deliberately does the opposite: the task brief requires the
 * select options to be *built from* the database's own const tuples,
 * never a hand-typed duplicate that could drift from the check
 * constraints. Importing the tuples is what keeps that promise; keeping
 * this module off the client's import graph is what keeps the build safe.
 */

export type FieldOption<T extends string = string> = {
  value: T
  label: string
  description: string
}

function optionsFor<T extends string>(
  values: readonly T[],
  meta: Record<T, { label: string; description: string }>,
): FieldOption<T>[] {
  return values.map((value) => ({ value, ...meta[value] }))
}

const SENTENCE_RHYTHM_META: Record<SentenceRhythm, { label: string; description: string }> = {
  'short-punchy': {
    label: 'Short and punchy',
    description: 'Short sentences that read fast, one idea at a time.',
  },
  varied: {
    label: 'Varied',
    description: 'A natural mix of short and long sentences.',
  },
  'long-flowing': {
    label: 'Long and flowing',
    description: 'Longer, more elaborate sentences that build on each other.',
  },
}

export const SENTENCE_RHYTHM_OPTIONS = optionsFor(SENTENCE_RHYTHMS, SENTENCE_RHYTHM_META)

const LINE_BREAK_STYLE_META: Record<LineBreakStyle, { label: string; description: string }> = {
  'single-line': {
    label: 'One line at a time',
    description: 'Every sentence gets its own line -- the classic LinkedIn look.',
  },
  grouped: {
    label: 'Grouped into short paragraphs',
    description: 'Sentences grouped into a few short paragraphs, with space between them.',
  },
  dense: {
    label: 'Dense paragraphs',
    description: 'Longer blocks of text with few line breaks.',
  },
}

export const LINE_BREAK_STYLE_OPTIONS = optionsFor(LINE_BREAK_STYLES, LINE_BREAK_STYLE_META)

const EMOJI_POLICY_META: Record<Frequency, { label: string; description: string }> = {
  none: { label: 'Never', description: 'No emoji in your posts.' },
  sparing: { label: 'Occasionally', description: 'An emoji here and there, not in every post.' },
  frequent: { label: 'Often', description: 'Regular emoji use throughout a post.' },
}

export const EMOJI_POLICY_OPTIONS = optionsFor(FREQUENCIES, EMOJI_POLICY_META)

const HASHTAG_POLICY_META: Record<Frequency, { label: string; description: string }> = {
  none: { label: 'Never', description: 'No hashtags on your posts.' },
  sparing: { label: 'Occasionally', description: 'A hashtag on some posts, not most.' },
  frequent: { label: 'Often', description: 'Most posts end with one or more hashtags.' },
}

export const HASHTAG_POLICY_OPTIONS = optionsFor(FREQUENCIES, HASHTAG_POLICY_META)

const POV_STRENGTH_META: Record<PovStrength, { label: string; description: string }> = {
  measured: {
    label: 'Measured',
    description: 'You state a view carefully, without overclaiming.',
  },
  balanced: {
    label: 'Balanced',
    description: 'You show more than one side before landing somewhere.',
  },
  contrarian: {
    label: 'Contrarian',
    description: 'You lead with pushback against the conventional take.',
  },
}

export const POV_STRENGTH_OPTIONS = optionsFor(POV_STRENGTHS, POV_STRENGTH_META)

const HUMOUR_LEVEL_META: Record<HumourLevel, { label: string; description: string }> = {
  none: { label: 'Straight', description: 'No jokes -- the tone stays serious throughout.' },
  dry: { label: 'Dry', description: 'Understated, deadpan humour.' },
  playful: { label: 'Playful', description: 'Lighter, more overtly funny.' },
}

export const HUMOUR_LEVEL_OPTIONS = optionsFor(HUMOUR_LEVELS, HUMOUR_LEVEL_META)

const FORMALITY_META: Record<Formality, { label: string; description: string }> = {
  formal: { label: 'Formal', description: 'Polished, businesslike language.' },
  conversational: {
    label: 'Conversational',
    description: 'Plain language, like talking to a peer.',
  },
  casual: { label: 'Casual', description: 'Relaxed and informal.' },
}

export const FORMALITY_OPTIONS = optionsFor(FORMALITIES, FORMALITY_META)

/**
 * Everything the editor form submits. Every enumerated field is a raw
 * string (whatever a native `<select>` posted) rather than its narrowed
 * union type -- `parseVoiceFormValues` is what checks it actually belongs
 * to the allowed set before it becomes a `VoiceProfileEdit`. Array fields
 * are already split into individual items by the add/remove list widget.
 */
export type VoiceFormValues = {
  sentenceRhythm: string
  lineBreakStyle: string
  emojiPolicy: string
  hashtagPolicy: string
  povStrength: string
  humourLevel: string
  formality: string
  openerPatterns: string[]
  closerPatterns: string[]
  vocabularyMarkers: string[]
  bannedPhrases: string[]
}

export type VoiceFormParseResult =
  | { success: true; edit: VoiceProfileEdit }
  | { success: false; message: string }

function isAllowedValue<T extends string>(allowed: readonly T[], value: string): value is T {
  return (allowed as readonly string[]).includes(value)
}

/** Trims each entry and drops anything left blank. Order is preserved --
 * these are patterns and phrases, not a set, and the user's own ordering
 * (most-used first, say) is meaningful. */
function normalizeList(items: readonly string[]): string[] {
  return items.map((item) => item.trim()).filter((item) => item.length > 0)
}

/**
 * Validates a submitted form against the seven check constraints and maps
 * it to a `VoiceProfileEdit`. The UI only ever offers values drawn from the
 * `*_OPTIONS` catalogues above, so this should never actually reject a
 * real submission -- but a stale client, a hand-crafted request, or a
 * future UI bug is exactly what CLAUDE.md means by "a type error at the
 * boundary is a better failure than 23514": this is that boundary.
 */
export function parseVoiceFormValues(values: VoiceFormValues): VoiceFormParseResult {
  if (!isAllowedValue(SENTENCE_RHYTHMS, values.sentenceRhythm)) {
    return { success: false, message: 'Sentence rhythm is not one of the allowed options.' }
  }
  if (!isAllowedValue(LINE_BREAK_STYLES, values.lineBreakStyle)) {
    return { success: false, message: 'Line break style is not one of the allowed options.' }
  }
  if (!isAllowedValue(FREQUENCIES, values.emojiPolicy)) {
    return { success: false, message: 'Emoji frequency is not one of the allowed options.' }
  }
  if (!isAllowedValue(FREQUENCIES, values.hashtagPolicy)) {
    return { success: false, message: 'Hashtag frequency is not one of the allowed options.' }
  }
  if (!isAllowedValue(POV_STRENGTHS, values.povStrength)) {
    return { success: false, message: 'Point-of-view strength is not one of the allowed options.' }
  }
  if (!isAllowedValue(HUMOUR_LEVELS, values.humourLevel)) {
    return { success: false, message: 'Humour level is not one of the allowed options.' }
  }
  if (!isAllowedValue(FORMALITIES, values.formality)) {
    return { success: false, message: 'Formality is not one of the allowed options.' }
  }

  return {
    success: true,
    edit: {
      sentenceRhythm: values.sentenceRhythm,
      lineBreakStyle: values.lineBreakStyle,
      emojiPolicy: values.emojiPolicy,
      hashtagPolicy: values.hashtagPolicy,
      povStrength: values.povStrength,
      humourLevel: values.humourLevel,
      formality: values.formality,
      openerPatterns: normalizeList(values.openerPatterns),
      closerPatterns: normalizeList(values.closerPatterns),
      vocabularyMarkers: normalizeList(values.vocabularyMarkers),
      bannedPhrases: normalizeList(values.bannedPhrases),
    },
  }
}
