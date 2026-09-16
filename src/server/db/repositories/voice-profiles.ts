import 'server-only'
import { getPrisma } from '../client'

/**
 * Voice Profile data access (spec §4.1).
 *
 * Prisma bypasses row-level security. **Every exported function takes userId
 * first and scopes on it.** That is the authorization model.
 *
 * Two kinds of field live here and they are written by different paths:
 *
 *   * Measured — sentence lengths, paragraph shape. Computed in code from the
 *     samples, never asked of a model (spec §8, amended).
 *   * Judged — rhythm, formality, humour, POV strength, patterns. These come
 *     from the model, which is why the database puts a check constraint on
 *     every one of them.
 *
 * The union types below mirror those check constraints exactly. Keep them in
 * step with supabase/migrations/0003_onboarding.sql: a value that type-checks
 * but violates the constraint fails at runtime with 23514, which is a worse
 * error than a compile failure and arrives much later.
 */

export const SENTENCE_RHYTHMS = ['short-punchy', 'varied', 'long-flowing'] as const
export const LINE_BREAK_STYLES = ['single-line', 'grouped', 'dense'] as const
export const FREQUENCIES = ['none', 'sparing', 'frequent'] as const
export const POV_STRENGTHS = ['measured', 'balanced', 'contrarian'] as const
export const HUMOUR_LEVELS = ['none', 'dry', 'playful'] as const
export const FORMALITIES = ['formal', 'conversational', 'casual'] as const

export type SentenceRhythm = (typeof SENTENCE_RHYTHMS)[number]
export type LineBreakStyle = (typeof LINE_BREAK_STYLES)[number]
/** Shared by emoji and hashtag policy — the same three-point scale. */
export type Frequency = (typeof FREQUENCIES)[number]
export type PovStrength = (typeof POV_STRENGTHS)[number]
export type HumourLevel = (typeof HUMOUR_LEVELS)[number]
export type Formality = (typeof FORMALITIES)[number]

export type VoiceProfile = {
  userId: string
  avgSentenceLength: number | null
  maxSentenceLength: number | null
  avgParagraphLines: number | null
  sentenceRhythm: SentenceRhythm
  lineBreakStyle: LineBreakStyle
  emojiPolicy: Frequency
  hashtagPolicy: Frequency
  povStrength: PovStrength
  humourLevel: HumourLevel
  formality: Formality
  openerPatterns: string[]
  closerPatterns: string[]
  vocabularyMarkers: string[]
  bannedPhrases: string[]
  /** Null until the first derivation runs. */
  derivedAt: Date | null
  /** True once the user has changed anything. A re-derivation must respect it. */
  userEdited: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * numeric(5,2) arrives as a Prisma Decimal, which is not a number and does not
 * survive serialisation into a client component. Converted once, here.
 */
type DecimalLike = { toNumber(): number } | null

type VoiceProfileRow = {
  user_id: string
  avg_sentence_length: DecimalLike
  max_sentence_length: number | null
  avg_paragraph_lines: DecimalLike
  sentence_rhythm: string
  line_break_style: string
  emoji_policy: string
  hashtag_policy: string
  pov_strength: string
  humour_level: string
  formality: string
  opener_patterns: string[]
  closer_patterns: string[]
  vocabulary_markers: string[]
  banned_phrases: string[]
  derived_at: Date | null
  user_edited: boolean
  created_at: Date
  updated_at: Date
}

function toNumber(value: DecimalLike): number | null {
  return value === null ? null : value.toNumber()
}

function toVoiceProfile(row: VoiceProfileRow): VoiceProfile {
  return {
    userId: row.user_id,
    avgSentenceLength: toNumber(row.avg_sentence_length),
    maxSentenceLength: row.max_sentence_length,
    avgParagraphLines: toNumber(row.avg_paragraph_lines),
    sentenceRhythm: row.sentence_rhythm as SentenceRhythm,
    lineBreakStyle: row.line_break_style as LineBreakStyle,
    emojiPolicy: row.emoji_policy as Frequency,
    hashtagPolicy: row.hashtag_policy as Frequency,
    povStrength: row.pov_strength as PovStrength,
    humourLevel: row.humour_level as HumourLevel,
    formality: row.formality as Formality,
    openerPatterns: row.opener_patterns,
    closerPatterns: row.closer_patterns,
    vocabularyMarkers: row.vocabulary_markers,
    bannedPhrases: row.banned_phrases,
    derivedAt: row.derived_at,
    userEdited: row.user_edited,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Everything a derivation produces. All fields required — a derivation is whole. */
export type DerivedVoiceProfile = {
  avgSentenceLength: number
  maxSentenceLength: number
  avgParagraphLines: number
  sentenceRhythm: SentenceRhythm
  lineBreakStyle: LineBreakStyle
  emojiPolicy: Frequency
  hashtagPolicy: Frequency
  povStrength: PovStrength
  humourLevel: HumourLevel
  formality: Formality
  openerPatterns: string[]
  closerPatterns: string[]
  vocabularyMarkers: string[]
  bannedPhrases: string[]
}

/** What the editor may change. Measured fields are absent on purpose. */
export type VoiceProfileEdit = Partial<
  Pick<
    VoiceProfile,
    | 'sentenceRhythm'
    | 'lineBreakStyle'
    | 'emojiPolicy'
    | 'hashtagPolicy'
    | 'povStrength'
    | 'humourLevel'
    | 'formality'
    | 'openerPatterns'
    | 'closerPatterns'
    | 'vocabularyMarkers'
    | 'bannedPhrases'
  >
>

export async function getVoiceProfile(
  userId: string,
): Promise<VoiceProfile | null> {
  const row = await getPrisma().voice_profiles.findUnique({
    where: { user_id: userId },
  })
  return row ? toVoiceProfile(row) : null
}

/**
 * Thrown by `saveDerivedVoiceProfile` when it refuses to overwrite a
 * profile the user has already edited (`user_edited = true`) and the
 * caller has not explicitly opted in via `{ overwriteUserEdited: true }`
 * (I1b). A caller that legitimately wants to replace an edited profile
 * must say so at its own call site rather than this function silently
 * doing it by default.
 */
export class VoiceProfileEditedError extends Error {
  constructor(userId: string) {
    super(`Refusing to overwrite the user-edited voice profile for user ${userId}`)
    this.name = 'VoiceProfileEditedError'
  }
}

export type SaveDerivedVoiceProfileOptions = {
  /**
   * Overwrite a profile with `user_edited = true` anyway. Defaults to
   * `false`: spec §4.1's editability guarantee ("a later re-derivation
   * knows not to silently overwrite a human decision") is only real if the
   * default behaviour actually refuses. No caller on this branch passes
   * `true` -- the samples step (the only caller) only ever derives before
   * the user has had a chance to reach the voice step and edit anything,
   * and I1a's page guards stop a finished user from reaching the samples
   * step again to retrigger it. This flag exists so a future caller that
   * genuinely needs to replace an edited profile (e.g. an explicit
   * "re-derive from scratch" settings action) can say so, rather than the
   * refusal below having no escape hatch at all.
   */
  overwriteUserEdited?: boolean
}

/**
 * Write the output of a derivation.
 *
 * Refuses to overwrite a profile with `user_edited = true` unless the
 * caller passes `{ overwriteUserEdited: true }` -- throwing
 * `VoiceProfileEditedError` instead (I1b). A re-derivation must not
 * silently undo a human's editing decision; this was previously left to
 * "callers must check `userEdited` themselves", which nothing on this
 * branch actually did.
 *
 * When it does write, this still does not itself touch `user_edited`
 * either way: this records what the machine decided, and whether a human
 * has since disagreed is a separate fact, set only by `updateVoiceProfile`.
 */
export async function saveDerivedVoiceProfile(
  userId: string,
  derived: DerivedVoiceProfile,
  options: SaveDerivedVoiceProfileOptions = {},
): Promise<VoiceProfile> {
  if (!options.overwriteUserEdited) {
    const existing = await getPrisma().voice_profiles.findUnique({
      where: { user_id: userId },
      select: { user_edited: true },
    })
    if (existing?.user_edited) {
      throw new VoiceProfileEditedError(userId)
    }
  }

  const fields = {
    avg_sentence_length: derived.avgSentenceLength,
    max_sentence_length: derived.maxSentenceLength,
    avg_paragraph_lines: derived.avgParagraphLines,
    sentence_rhythm: derived.sentenceRhythm,
    line_break_style: derived.lineBreakStyle,
    emoji_policy: derived.emojiPolicy,
    hashtag_policy: derived.hashtagPolicy,
    pov_strength: derived.povStrength,
    humour_level: derived.humourLevel,
    formality: derived.formality,
    opener_patterns: derived.openerPatterns,
    closer_patterns: derived.closerPatterns,
    vocabulary_markers: derived.vocabularyMarkers,
    banned_phrases: derived.bannedPhrases,
    derived_at: new Date(),
  }

  const row = await getPrisma().voice_profiles.upsert({
    where: { user_id: userId },
    create: { user_id: userId, ...fields },
    update: fields,
  })
  return toVoiceProfile(row)
}

/**
 * Apply a user's edit. Always sets user_edited, which is the point of the
 * column: it is how a later re-derivation knows a human has had an opinion.
 */
export async function updateVoiceProfile(
  userId: string,
  edit: VoiceProfileEdit,
): Promise<VoiceProfile> {
  const row = await getPrisma().voice_profiles.update({
    where: { user_id: userId },
    data: {
      ...(edit.sentenceRhythm !== undefined && {
        sentence_rhythm: edit.sentenceRhythm,
      }),
      ...(edit.lineBreakStyle !== undefined && {
        line_break_style: edit.lineBreakStyle,
      }),
      ...(edit.emojiPolicy !== undefined && { emoji_policy: edit.emojiPolicy }),
      ...(edit.hashtagPolicy !== undefined && {
        hashtag_policy: edit.hashtagPolicy,
      }),
      ...(edit.povStrength !== undefined && { pov_strength: edit.povStrength }),
      ...(edit.humourLevel !== undefined && { humour_level: edit.humourLevel }),
      ...(edit.formality !== undefined && { formality: edit.formality }),
      ...(edit.openerPatterns !== undefined && {
        opener_patterns: edit.openerPatterns,
      }),
      ...(edit.closerPatterns !== undefined && {
        closer_patterns: edit.closerPatterns,
      }),
      ...(edit.vocabularyMarkers !== undefined && {
        vocabulary_markers: edit.vocabularyMarkers,
      }),
      ...(edit.bannedPhrases !== undefined && {
        banned_phrases: edit.bannedPhrases,
      }),
      user_edited: true,
    },
  })
  return toVoiceProfile(row)
}
