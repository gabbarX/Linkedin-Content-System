/**
 * The preference signals Milestone 9 synthesises learnings from (spec §4.8).
 *
 * Both functions here are arithmetic over LinkBud's own text: what the model
 * generated, and what the user saved. **Neither ever compares against text
 * fetched back from LinkedIn.** docs/LINKEDIN-COMPLIANCE.md §4 names that trap
 * by name — caching published text makes draft-versus-published diffing
 * trivial and is a terms violation sitting in the database. Our generated text
 * is ours to keep indefinitely, so the diff is taken there.
 *
 * Pure, client-safe and hand-rolled. There is no diff library in this project
 * and adding a dependency is a lifetime maintenance cost on a solo project for
 * what is sixty lines; these are tested instead (Ruling R-M5-8).
 */

/**
 * The shortest run of shared characters that counts as "borrowed".
 *
 * Forty is long enough that an ordinary sentence fragment two drafts happen to
 * share ("and that is why I stopped charging by the hour") does not register,
 * and short enough to catch a single lifted line. It is a judgement, not a
 * measurement, and the tests pin the boundary either side of it.
 */
export const BORROWED_MIN_RUN = 40

/** Guards the O(n·m) work below against a pathologically long draft. */
const MAX_COMPARE = 6000

export type VariantText = {
  variantIndex: number
  content: string
}

export type BorrowedSpans = {
  /** Which unchosen variants contributed a run, ascending. */
  fromVariants: number[]
  /**
   * How much of the final text came from them, counted as a union of covered
   * positions — text present in two variants is counted once, not twice.
   */
  charCount: number
}

export type BorrowedSpansOptions = {
  /**
   * The chosen variant's own text. **Runs that also appear here are not
   * borrowing**, and leaving this out makes the measurement close to
   * meaningless.
   *
   * All three variants are written from one brief, so they independently
   * produce near-identical sentences — the brief's call to action comes back
   * almost verbatim in all three. Without this exclusion, a user who pasted
   * one line from another draft was measured at 57% borrowed in a real run,
   * because the chosen draft's own words happened to appear in the others too.
   * Milestone 9 would have learned that this person blends heavily when they
   * barely blend at all.
   */
  chosen?: string | null
  minRun?: number
}

/**
 * Which of the unchosen variants the user actually copied lines out of.
 *
 * Spec §4.4 calls blending "a human editing action, not an AI merge step", and
 * says the cross-copied text is recorded as a preference signal. This is that
 * measurement: runs of the final text that appear in a variant the user did
 * **not** choose, and do **not** appear in the one they did. Keeping your own
 * draft's words is not borrowing, however many other drafts happen to contain
 * the same sentence.
 */
export function borrowedSpans(
  finalText: string,
  others: readonly VariantText[],
  options: BorrowedSpansOptions = {},
): BorrowedSpans {
  const minRun = options.minRun ?? BORROWED_MIN_RUN
  const chosen =
    options.chosen === null || options.chosen === undefined
      ? null
      : Array.from(options.chosen).slice(0, MAX_COMPARE).join('')

  const final = Array.from(finalText).slice(0, MAX_COMPARE)
  if (final.length < minRun || others.length === 0) {
    return { fromVariants: [], charCount: 0 }
  }

  // Positions of `final` covered by a run from any variant. A union, so a line
  // that appears in two variants is not counted twice.
  const covered = new Array<boolean>(final.length).fill(false)
  const contributing = new Set<number>()

  for (const other of others) {
    const candidate = Array.from(other.content).slice(0, MAX_COMPARE).join('')
    if (candidate.length === 0) continue

    let index = 0
    while (index + minRun <= final.length) {
      const window = final.slice(index, index + minRun).join('')
      // Present in the chosen draft too, so the user kept their own words
      // rather than taking someone else's. Not borrowing.
      if (chosen !== null && chosen.includes(window)) {
        index += 1
        continue
      }
      if (!candidate.includes(window)) {
        index += 1
        continue
      }

      // Extend the match as far as it keeps appearing in the variant AND stays
      // absent from the chosen one, so a wholly copied paragraph is counted at
      // its real length without bleeding into shared boilerplate either side.
      let length = minRun
      while (
        index + length < final.length &&
        candidate.includes(final.slice(index, index + length + 1).join('')) &&
        (chosen === null || !chosen.includes(final.slice(index, index + length + 1).join('')))
      ) {
        length += 1
      }

      contributing.add(other.variantIndex)
      for (let offset = index; offset < index + length; offset += 1) {
        covered[offset] = true
      }
      index += length
    }
  }

  return {
    fromVariants: [...contributing].sort((a, b) => a - b),
    charCount: covered.reduce((total, hit) => (hit ? total + 1 : total), 0),
  }
}

/**
 * How much the user rewrote, from 0 (untouched) to 1 (nothing survived).
 *
 * Levenshtein distance normalised by the longer string, computed over code
 * points so replacing one emoji counts as one edit rather than two. Two rows
 * rather than a full matrix, because a 3,000-character post against a
 * 3,000-character post is nine million cells and there is no reason to hold
 * them all.
 *
 * The result feeds a `numeric(4,3)` column with a `between 0 and 1` check, so
 * it is clamped rather than trusted to land in range.
 */
export function editRatio(generated: string, final: string): number {
  const a = Array.from(generated).slice(0, MAX_COMPARE)
  const b = Array.from(final).slice(0, MAX_COMPARE)

  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 0

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)

  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1)
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      const deletion = (previous[j] ?? 0) + 1
      const insertion = (current[j - 1] ?? 0) + 1
      current[j] = Math.min(substitution, deletion, insertion)
    }
    previous = current
  }

  const distance = previous[b.length] ?? longest
  const ratio = distance / longest
  return Math.min(1, Math.max(0, Number(ratio.toFixed(3))))
}
