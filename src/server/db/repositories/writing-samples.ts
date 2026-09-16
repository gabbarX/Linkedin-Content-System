import 'server-only'
import { getPrisma } from '../client'

/**
 * Writing sample data access (spec §4.1).
 *
 * Prisma bypasses row-level security. **Every exported function takes userId
 * first and scopes on it.** That is the authorization model.
 *
 * These are the user's own words, pasted by them. Nothing here is ever fetched
 * from LinkedIn: `r_member_social` is closed to new access and scraping is an
 * architectural boundary, not a trade-off (docs/LINKEDIN-COMPLIANCE.md). The
 * 48-hour purge rule covers LinkedIn-returned content and therefore does not
 * apply to this table — these rows are kept for as long as the account exists,
 * because the voice profile is derived from them.
 *
 * Samples are immutable. They are created and deleted, never edited: an edit
 * would silently invalidate the stored counts and the voice profile derived
 * from them. The database has no update policy for this table.
 */

export const SAMPLE_SOURCES = ['pasted', 'written'] as const
export type SampleSource = (typeof SAMPLE_SOURCES)[number]

export type WritingSample = {
  id: string
  userId: string
  content: string
  source: SampleSource
  wordCount: number
  charCount: number
  lineCount: number
  emojiCount: number
  hashtagCount: number
  createdAt: Date
}

type WritingSampleRow = {
  id: string
  user_id: string
  content: string
  source: string
  word_count: number
  char_count: number
  line_count: number
  emoji_count: number
  hashtag_count: number
  created_at: Date
}

function toWritingSample(row: WritingSampleRow): WritingSample {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    source: row.source as SampleSource,
    wordCount: row.word_count,
    charCount: row.char_count,
    lineCount: row.line_count,
    emojiCount: row.emoji_count,
    hashtagCount: row.hashtag_count,
    createdAt: row.created_at,
  }
}

/** Counts are computed by measureSamples() before they get here. */
export type NewWritingSample = {
  content: string
  source: SampleSource
  wordCount: number
  charCount: number
  lineCount: number
  emojiCount: number
  hashtagCount: number
}

/** Oldest first, so the order matches the order they were pasted. */
export async function listWritingSamples(
  userId: string,
): Promise<WritingSample[]> {
  const rows = await getPrisma().writing_samples.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'asc' },
  })
  return rows.map(toWritingSample)
}

export async function countWritingSamples(userId: string): Promise<number> {
  return getPrisma().writing_samples.count({ where: { user_id: userId } })
}

/**
 * Insert a batch. One call rather than a loop, so a partial failure cannot
 * leave the user with three of their five samples and a voice profile derived
 * from the wrong input.
 */
export async function addWritingSamples(
  userId: string,
  samples: NewWritingSample[],
): Promise<number> {
  if (samples.length === 0) return 0

  const result = await getPrisma().writing_samples.createMany({
    data: samples.map((sample) => ({
      user_id: userId,
      content: sample.content,
      source: sample.source,
      word_count: sample.wordCount,
      char_count: sample.charCount,
      line_count: sample.lineCount,
      emoji_count: sample.emojiCount,
      hashtag_count: sample.hashtagCount,
    })),
  })
  return result.count
}

/**
 * Scoped by BOTH id and userId, and that is not belt-and-braces. Filtering on
 * id alone would let any signed-in user delete any other user's sample by
 * guessing a uuid — RLS is not there to catch it on the Prisma path.
 */
export async function deleteWritingSample(
  userId: string,
  sampleId: string,
): Promise<void> {
  await getPrisma().writing_samples.deleteMany({
    where: { id: sampleId, user_id: userId },
  })
}

/** Used when a user restarts the sample step rather than adding to it. */
export async function deleteAllWritingSamples(userId: string): Promise<void> {
  await getPrisma().writing_samples.deleteMany({ where: { user_id: userId } })
}
