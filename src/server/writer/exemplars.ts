import 'server-only'
import type { SlotFormat } from '@/lib/strategy/vocabulary'
import type { WritingSample } from '@/server/db/repositories/writing-samples'

/**
 * Pick the user's own posts that most resemble the one about to be written.
 *
 * Spec §4.4: "Context per generation: Voice Profile + the 3 most
 * format-similar real samples + brief." Spec §3.2 fixes *how* they are
 * matched: "format and structure heuristics (post length band, opener type,
 * list vs narrative, paragraph count) rather than vector similarity", and that
 * decision survived Gemini arriving with embeddings — "the v1 decision stands
 * until heuristics are measured and found wanting".
 *
 * Two properties this has and a vector search would not: it costs nothing, and
 * it is deterministic, so regenerating a post twice uses the same exemplars and
 * any difference in the output came from the model rather than from us.
 *
 * The samples are the user's own pasted writing. Nothing here is fetched from
 * LinkedIn — `r_member_social` is closed and scraping is an architectural
 * boundary (docs/LINKEDIN-COMPLIANCE.md).
 */

/** Spec §4.4: three. */
export const EXEMPLAR_COUNT = 3

export type LengthBand = 'short' | 'medium' | 'long'
export type OpenerType = 'question' | 'number' | 'statement'
export type Structure = 'list' | 'narrative'

export type SampleFeatures = {
  lengthBand: LengthBand
  openerType: OpenerType
  structure: Structure
  paragraphCount: number
}

/**
 * Bands rather than raw counts, because the question is "does this read like
 * the post I am about to write", not "is it within 40 characters of it".
 * Boundaries are judgement: roughly a scroll, roughly a full-screen post.
 */
function bandFor(charCount: number): LengthBand {
  if (charCount < 800) return 'short'
  if (charCount < 1600) return 'medium'
  return 'long'
}

/** Two or more marker-led lines. One numbered line in prose is not a list. */
function structureOf(content: string): Structure {
  const markerLines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*•]|\d+[.)])\s+/.test(line))
  return markerLines.length >= 2 ? 'list' : 'narrative'
}

/**
 * Three opener types, not four. A "scene" opener is the one a story post
 * really wants, but every cheap test for it (a pronoun, a past-tense verb, a
 * date) misfires often enough to be noise, and inventing a signal is worse
 * than not having one. Story posts are matched on structure and length
 * instead.
 */
function openerOf(content: string): OpenerType {
  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (firstLine === undefined) return 'statement'
  if (firstLine.includes('?')) return 'question'
  if (/^\W*\d/.test(firstLine)) return 'number'
  return 'statement'
}

function paragraphsOf(content: string): number {
  return content.split(/\n\s*\n+/).filter((paragraph) => paragraph.trim().length > 0).length
}

export function featuresOf(sample: WritingSample): SampleFeatures {
  return {
    lengthBand: bandFor(sample.charCount),
    openerType: openerOf(sample.content),
    structure: structureOf(sample.content),
    paragraphCount: paragraphsOf(sample.content),
  }
}

/**
 * What a post of each format tends to look like structurally.
 *
 * `openerType` is null where the format does not imply one — a how-to can open
 * any way at all, and pretending otherwise would rank samples on a coin flip.
 */
type FormatProfile = {
  structure: Structure
  lengthBand: LengthBand
  openerType: OpenerType | null
}

const FORMAT_PROFILE: Record<SlotFormat, FormatProfile> = {
  story: { structure: 'narrative', lengthBand: 'long', openerType: null },
  'how-to': { structure: 'list', lengthBand: 'medium', openerType: null },
  list: { structure: 'list', lengthBand: 'medium', openerType: 'number' },
  contrarian: { structure: 'narrative', lengthBand: 'short', openerType: 'statement' },
  'case-study': { structure: 'narrative', lengthBand: 'long', openerType: 'number' },
  question: { structure: 'narrative', lengthBand: 'short', openerType: 'question' },
}

/** Structure carries most of the resemblance, so it is weighted highest. */
function score(features: SampleFeatures, profile: FormatProfile): number {
  let total = 0
  if (features.structure === profile.structure) total += 3
  if (features.lengthBand === profile.lengthBand) total += 2
  if (profile.openerType !== null && features.openerType === profile.openerType) total += 1
  return total
}

/**
 * The best `limit` samples for this format, best first.
 *
 * Returns fewer than `limit` when the user has fewer samples — the "2 written
 * samples" onboarding path is legitimate, and two exemplars beat refusing to
 * write. Ties keep the original order, so the selection is stable across
 * regenerations.
 */
export function selectExemplars(
  samples: readonly WritingSample[],
  format: SlotFormat,
  limit: number = EXEMPLAR_COUNT,
): WritingSample[] {
  const profile = FORMAT_PROFILE[format]
  return samples
    .map((sample, index) => ({ sample, index, score: score(featuresOf(sample), profile) }))
    .sort((a, b) => (b.score === a.score ? a.index - b.index : b.score - a.score))
    .slice(0, limit)
    .map((entry) => entry.sample)
}
