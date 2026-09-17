import { describe, expect, it } from 'vitest'
import { BORROWED_MIN_RUN, borrowedSpans, editRatio } from './signals'

/**
 * The preference signals Milestone 9 reads (spec §4.8). They are computed here
 * rather than asked of a model, so they are arithmetic and they are tested.
 *
 * Both compare LinkBud's own generated text against LinkBud's own final text.
 * Neither ever touches text fetched back from LinkedIn —
 * docs/LINKEDIN-COMPLIANCE.md §4 names that specifically, because caching
 * published text to make diffing easy is a terms violation sitting in the
 * database.
 */

const run = (n: number) => 'abcdefghij'.repeat(Math.ceil(n / 10)).slice(0, n)

describe('borrowedSpans', () => {
  it('reports nothing when the final text shares nothing with the others', () => {
    const result = borrowedSpans('Completely original words here.', [
      { variantIndex: 1, content: 'Nothing alike at all, truly.' },
    ])
    expect(result.fromVariants).toEqual([])
    expect(result.charCount).toBe(0)
  })

  // The characters either side of the shared text differ, so the shared run is
  // exactly `shared` and nothing longer. An earlier version of this test put a
  // space on both sides of both strings, which made the real shared run one
  // character longer than intended and the assertion wrong rather than the code.
  it('ignores a shared run shorter than the threshold', () => {
    const shared = run(BORROWED_MIN_RUN - 1)
    const result = borrowedSpans(`start:${shared}|end`, [
      { variantIndex: 1, content: `other-${shared}#thing` },
    ])
    expect(result.fromVariants).toEqual([])
    expect(result.charCount).toBe(0)
  })

  it('reports a shared run exactly at the threshold', () => {
    const shared = run(BORROWED_MIN_RUN)
    const result = borrowedSpans(`start:${shared}|end`, [
      { variantIndex: 1, content: `other-${shared}#thing` },
    ])
    expect(result.fromVariants).toEqual([1])
    expect(result.charCount).toBe(BORROWED_MIN_RUN)
  })

  it('names every variant a run came from', () => {
    const a = run(BORROWED_MIN_RUN)
    const b = 'zyxwvutsrq'.repeat(5).slice(0, BORROWED_MIN_RUN)
    const result = borrowedSpans(`${a} middle ${b}`, [
      { variantIndex: 0, content: `lead in ${a} tail` },
      { variantIndex: 2, content: `lead in ${b} tail` },
    ])
    expect(result.fromVariants).toEqual([0, 2])
  })

  it('does not double-count a run present in two variants', () => {
    const shared = run(BORROWED_MIN_RUN)
    const result = borrowedSpans(shared, [
      { variantIndex: 0, content: shared },
      { variantIndex: 1, content: shared },
    ])
    expect(result.fromVariants).toEqual([0, 1])
    // The union of covered positions, not the sum per variant.
    expect(result.charCount).toBe(BORROWED_MIN_RUN)
  })

  it('returns variant indexes in ascending order', () => {
    const shared = run(BORROWED_MIN_RUN)
    const result = borrowedSpans(shared, [
      { variantIndex: 2, content: shared },
      { variantIndex: 0, content: shared },
    ])
    expect(result.fromVariants).toEqual([0, 2])
  })

  it('handles an empty final text and an empty variant list', () => {
    expect(borrowedSpans('', [{ variantIndex: 0, content: 'x' }]).charCount).toBe(0)
    expect(borrowedSpans('some text', []).fromVariants).toEqual([])
  })
})

describe('editRatio', () => {
  it('is 0 when the user changed nothing', () => {
    expect(editRatio('the same text', 'the same text')).toBe(0)
  })

  it('is 1 when nothing of the original survives', () => {
    expect(editRatio('aaaaaa', 'bbbbbb')).toBe(1)
  })

  it('is between 0 and 1 for a partial edit', () => {
    const ratio = editRatio('the quick brown fox', 'the quick red fox')
    expect(ratio).toBeGreaterThan(0)
    expect(ratio).toBeLessThan(1)
  })

  it('grows as the edit grows', () => {
    const small = editRatio('the quick brown fox', 'the quick brown cat')
    const large = editRatio('the quick brown fox', 'entirely different words now')
    expect(large).toBeGreaterThan(small)
  })

  it('treats an emptied draft as a complete rewrite', () => {
    expect(editRatio('something', '')).toBe(1)
  })

  it('is 0 for two empty strings rather than dividing by zero', () => {
    expect(editRatio('', '')).toBe(0)
  })

  it('never exceeds 1, so the numeric(4,3) check constraint cannot fail', () => {
    expect(editRatio('a', 'a much much longer replacement string entirely')).toBeLessThanOrEqual(1)
  })

  it('counts a surrogate pair as one edit, not two', () => {
    // Replacing one emoji with one letter is a single substitution.
    expect(editRatio('🚀', 'x')).toBe(1)
  })
})
