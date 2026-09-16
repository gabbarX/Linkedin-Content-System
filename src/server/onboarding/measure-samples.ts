import 'server-only'
import type { Frequency, LineBreakStyle } from '@/server/db/repositories/voice-profiles'

/**
 * Arithmetic over a writer's pasted samples (spec §4.1, amended §8: counting
 * is never asked of a model).
 *
 * Two exported functions, not one (ruling R1 in progress.md):
 *
 *   * `measureSample` -- one sample's counts, shaped to the five
 *     `writing_samples` columns (word_count, char_count, line_count,
 *     emoji_count, hashtag_count). A later task stores these per row.
 *   * `measureSamples` -- the aggregate `deriveVoiceProfile` needs, built on
 *     `measureSample` for the per-sample counts it reuses (emoji, hashtag),
 *     plus sentence- and paragraph-level statistics that no single sample's
 *     row can hold.
 *
 * Emoji are counted by grapheme cluster via `Intl.Segmenter`, not by
 * `string.length` or a naive code-point loop: a family emoji or a flag is one
 * user-perceived character built from several code points, and a surrogate
 * pair like '🚀' is one code point but two UTF-16 units. Counting UTF-16 units
 * reports 'frequent' for a user who used two emoji.
 */

export type SampleCounts = {
  wordCount: number
  charCount: number
  lineCount: number
  emojiCount: number
  hashtagCount: number
}

export type VoiceMeasurements = {
  avgSentenceLength: number
  maxSentenceLength: number
  avgParagraphLines: number
  lineBreakStyle: LineBreakStyle
  emojiPolicy: Frequency
  hashtagPolicy: Frequency
  /** Total emoji across every sample. Exposed because callers reasonably
   *  want the raw count alongside the policy classified from it. */
  emojiCount: number
  /** Total hashtags across every sample, same reasoning as emojiCount. */
  hashtagCount: number
}

const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' })
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

/** Matches one Unicode grapheme that is emoji-like. Applied per grapheme
 *  cluster, never per code point -- see the module doc. */
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u

/** A hashtag is '#' followed by anything that is not whitespace or another
 *  '#', so '#a #b' counts two, not one greedy match. */
const HASHTAG_PATTERN = /#[^\s#]+/gu

function countWords(text: string): number {
  let count = 0
  for (const { isWordLike } of wordSegmenter.segment(text)) {
    if (isWordLike) count += 1
  }
  return count
}

function countEmoji(text: string): number {
  let count = 0
  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (EMOJI_PATTERN.test(segment)) count += 1
  }
  return count
}

function countHashtags(text: string): number {
  return text.match(HASHTAG_PATTERN)?.length ?? 0
}

/** One sample's counts, shaped to the writing_samples columns. */
export function measureSample(text: string): SampleCounts {
  return {
    wordCount: countWords(text),
    // Code points, not text.length (UTF-16 units) -- same reasoning as
    // countEmoji: a surrogate pair must count once.
    charCount: Array.from(text).length,
    lineCount: text.split('\n').length,
    emojiCount: countEmoji(text),
    hashtagCount: countHashtags(text),
  }
}

/**
 * Word counts of the clauses in one sample, used only for the sentence-length
 * statistics below.
 *
 * A clause is the text between two sentence-ending marks ('.', '!', '?'),
 * splitting on the mark itself so it belongs to neither side. The word count
 * of a clause is a bare whitespace split of that raw (untrimmed) text: a
 * clause other than the first in a sample carries the space that followed the
 * previous mark, and a bare split counts that leading run as one token. That
 * is the convention this module uses throughout for "words in a sentence" --
 * it is what the fixtures in measure-samples.test.ts are written against.
 */
function clauseWordCounts(text: string): number[] {
  return text
    .split(/[.!?]+/)
    .filter((clause) => clause.trim().length > 0)
    .map((clause) => clause.split(/\s+/).length)
}

/** Line counts of the paragraphs in one sample. A paragraph is text between
 *  blank lines; its "length" for line-break-style purposes is how many
 *  physical lines it spans. */
function paragraphLineCounts(text: string): number[] {
  return text
    .split(/\n\s*\n+/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph) => paragraph.trim().split('\n').length)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function classifyLineBreakStyle(avgParagraphLines: number): LineBreakStyle {
  if (avgParagraphLines <= 1.5) return 'single-line'
  if (avgParagraphLines <= 3.5) return 'grouped'
  return 'dense'
}

/** Shared by emoji and hashtag policy: none / occasional / frequent, judged
 *  by average occurrences per post rather than the total across all samples
 *  -- a writer who used five hashtags once and none in four other samples
 *  reads as 'sparing' overall, not 'frequent'. */
function classifyFrequency(avgPerSample: number): Frequency {
  if (avgPerSample <= 0) return 'none'
  if (avgPerSample <= 2) return 'sparing'
  return 'frequent'
}

/** The aggregate a voice profile needs, built on measureSample. */
export function measureSamples(texts: string[]): VoiceMeasurements {
  // Every submitted sample counts as one "post" for the per-post averages
  // below, even a blank one -- guarded rather than filtered, so five real
  // hashtags in one sample among five blanks still reads as occasional use.
  const sampleCount = texts.length > 0 ? texts.length : 1

  const counts = texts.map(measureSample)
  const totalEmoji = counts.reduce((sum, c) => sum + c.emojiCount, 0)
  const totalHashtags = counts.reduce((sum, c) => sum + c.hashtagCount, 0)

  const sentenceLengths = texts.flatMap(clauseWordCounts)
  const paragraphLines = texts.flatMap(paragraphLineCounts)
  const avgParagraphLines = average(paragraphLines)

  return {
    avgSentenceLength: average(sentenceLengths),
    maxSentenceLength: sentenceLengths.length > 0 ? Math.max(...sentenceLengths) : 0,
    avgParagraphLines,
    lineBreakStyle: classifyLineBreakStyle(avgParagraphLines),
    emojiPolicy: classifyFrequency(totalEmoji / sampleCount),
    hashtagPolicy: classifyFrequency(totalHashtags / sampleCount),
    emojiCount: totalEmoji,
    hashtagCount: totalHashtags,
  }
}
