import { z } from 'zod'

/**
 * The writing-sample rule from spec §4.1: **five to ten pasted posts, or two
 * written fresh.** Fewer than five pasted samples does not characterise a
 * voice; more than ten is friction with no added signal. Two written-fresh
 * samples are an alternative path for someone who has never posted, or does
 * not want to paste anything.
 *
 * This module is deliberately free of `server-only` and of anything from
 * `@/server/**`: the whole point of `samplesSubmissionSchema` is that it is
 * the *same* schema instance behind both the client's inline "you're not
 * there yet" message and the server action's final check, so the two can
 * never say something different. A Client Component imports this file
 * directly (same reasoning as `src/lib/onboarding/steps.ts` and
 * `interview-draft.ts`).
 */

export const PASTE_MIN = 5
export const PASTE_MAX = 10
export const WRITTEN_MIN = 2

/** Shown before the user hits the rule, not after -- and reused verbatim by
 * the client's live status line and the server action's rejection. */
export const SAMPLES_RULE_MESSAGE = `Paste ${PASTE_MIN}–${PASTE_MAX} of your own past posts, or write ${WRITTEN_MIN} new ones from scratch.`

export const SAMPLE_SOURCES = ['pasted', 'written'] as const
export type SampleSourceInput = (typeof SAMPLE_SOURCES)[number]

export const sampleEntrySchema = z.object({
  content: z.string().trim().min(1, 'A sample cannot be empty.'),
  source: z.enum(SAMPLE_SOURCES),
})
export type SampleEntryInput = z.infer<typeof sampleEntrySchema>

/** Counts by source. Unexported helpers reach for this instead of filtering
 * the list twice by hand. */
export function countBySource(samples: readonly { source: SampleSourceInput }[]): {
  pasted: number
  written: number
} {
  let pasted = 0
  let written = 0
  for (const sample of samples) {
    if (sample.source === 'pasted') pasted += 1
    else written += 1
  }
  return { pasted, written }
}

/**
 * The rule itself, as a predicate over counts rather than the samples
 * directly, so both the schema's `superRefine` and the client's live status
 * line can share one evaluation without either re-deriving it.
 */
export function countsSatisfyRule(counts: { pasted: number; written: number }): boolean {
  const pastedValid = counts.pasted >= PASTE_MIN && counts.pasted <= PASTE_MAX
  const writtenValid = counts.written >= WRITTEN_MIN
  return pastedValid || writtenValid
}

export function samplesSatisfyRule(samples: readonly { source: SampleSourceInput }[]): boolean {
  return countsSatisfyRule(countBySource(samples))
}

/**
 * The shared schema. `samples` is validated per-entry (non-empty content, a
 * known source) and then, as a whole, against the 5-10/2-written rule --
 * which is a property of the *set*, not any single entry, hence the
 * `superRefine` rather than a `.min()`/`.max()` on the array itself.
 */
export const samplesSubmissionSchema = z
  .object({ samples: z.array(sampleEntrySchema) })
  .superRefine((data, ctx) => {
    if (!samplesSatisfyRule(data.samples)) {
      ctx.addIssue({ code: 'custom', message: SAMPLES_RULE_MESSAGE, path: ['samples'] })
    }
  })

/**
 * Splits one block of pasted text into individual posts.
 *
 * Posts are separated by a line containing nothing but three or more dashes
 * (a Markdown-style horizontal rule), never by a blank line: a single real
 * LinkedIn post routinely has blank lines between its own paragraphs (that is
 * exactly what `measureSample`'s paragraph/line-break analysis reads), so
 * splitting on those would shred one post into several fake ones.
 */
const SEPARATOR_LINE_PATTERN = /^[ \t]*-{3,}[ \t]*$/m

export function splitPastedText(text: string): string[] {
  return text
    .split(SEPARATOR_LINE_PATTERN)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
}
