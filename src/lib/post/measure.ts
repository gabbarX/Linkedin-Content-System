import { FOLD_CHARS, FOLD_LINES } from './vocabulary'

/**
 * How long a post is, and where the feed folds it.
 *
 * **Client-safe, and that is the whole point of the module.** The editor shows
 * a live character count while the user types, and the server checks the same
 * number; `src/server/onboarding/measure-samples.ts` is `server-only`, so the
 * editor cannot import it. Rather than write a second counter that would
 * disagree with the first on every emoji, the counting lives here and
 * `measure-samples.ts` imports it — one implementation, two callers (Ruling
 * R-M5-13). This is the `samples.ts` pattern: the same function behind the
 * client's message and the server's check, so the two can never differ.
 */

/**
 * Characters as a person counts them, and as LinkedIn's own composer does:
 * **code points, not UTF-16 units**.
 *
 * `'🚀'.length` is 2, because a surrogate pair is one code point stored as two
 * units. A counter reporting 2 tells a user near the limit they have less room
 * than they really do, and a truncation at a UTF-16 index can cut a pair in
 * half and render a replacement character.
 */
export function countCharacters(text: string): number {
  return Array.from(text).length
}

export type FoldResult = {
  /** The part the feed shows before "…see more". */
  visible: string
  /** The remainder, hidden behind the fold. Empty when nothing is hidden. */
  hidden: string
  /** True when the feed would collapse this post at all. */
  folded: boolean
}

/**
 * Split a post at the point the feed collapses it.
 *
 * Two limits apply and the earlier one wins: a character count, and a line
 * count — a short post broken across many lines still folds. `visible + hidden`
 * always reconstructs the input exactly, so the preview can render both halves
 * without the text drifting.
 *
 * Splitting happens on code points, never on UTF-16 indexes, so an emoji at
 * the boundary lands whole on one side rather than becoming half a surrogate
 * pair on each.
 */
export function splitAtFold(text: string): FoldResult {
  const codePoints = Array.from(text)

  // Where the character limit would cut, if it applies at all.
  const charCut = codePoints.length > FOLD_CHARS ? FOLD_CHARS : null

  // Where the line limit would cut: the end of the FOLD_LINES-th line. Found
  // by counting newlines rather than by splitting, so the index stays in code
  // points and lines up with charCut.
  let lineCut: number | null = null
  let linesSeen = 0
  for (let index = 0; index < codePoints.length; index += 1) {
    if (codePoints[index] === '\n') {
      linesSeen += 1
      if (linesSeen === FOLD_LINES) {
        // Cut before this newline, so `visible` holds exactly FOLD_LINES lines
        // and the newline itself opens the hidden half.
        lineCut = index
        break
      }
    }
  }

  const cut =
    charCut === null ? lineCut : lineCut === null ? charCut : Math.min(charCut, lineCut)

  if (cut === null) {
    return { visible: text, hidden: '', folded: false }
  }

  return {
    visible: codePoints.slice(0, cut).join(''),
    hidden: codePoints.slice(cut).join(''),
    folded: true,
  }
}
