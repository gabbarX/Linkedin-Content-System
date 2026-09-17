import { describe, expect, it } from 'vitest'
import { countCharacters, splitAtFold } from './measure'
import { FOLD_CHARS, FOLD_LINES } from './vocabulary'

/**
 * These are the numbers the editor shows a user while they type and the
 * numbers the preview draws a fold from. They are the reason this module is
 * client-safe: `measure-samples.ts` is `server-only`, and a second
 * implementation of "how long is this post" would disagree with the first on
 * every emoji.
 */

describe('countCharacters', () => {
  it('counts plain text', () => {
    expect(countCharacters('hello')).toBe(5)
  })

  it('counts an empty string as zero', () => {
    expect(countCharacters('')).toBe(0)
  })

  // The trap measure-samples.ts documents: '🚀'.length is 2, because a
  // surrogate pair is one code point stored as two UTF-16 units. A counter
  // that reports 2 tells a user near the limit that they have less room than
  // they do.
  it('counts a surrogate pair as one character, not two', () => {
    expect('🚀'.length).toBe(2)
    expect(countCharacters('🚀')).toBe(1)
  })

  it('counts emoji mixed into text correctly', () => {
    expect(countCharacters('a🚀b')).toBe(3)
  })

  it('counts newlines, because LinkedIn does', () => {
    expect(countCharacters('a\nb')).toBe(3)
  })
})

describe('splitAtFold', () => {
  it('does not fold short text', () => {
    const result = splitAtFold('Short post.')
    expect(result.hidden).toBe('')
    expect(result.visible).toBe('Short post.')
    expect(result.folded).toBe(false)
  })

  it('folds text longer than the character threshold', () => {
    const text = 'x'.repeat(FOLD_CHARS + 50)
    const result = splitAtFold(text)
    expect(result.folded).toBe(true)
    expect(countCharacters(result.visible)).toBe(FOLD_CHARS)
    expect(countCharacters(result.hidden)).toBe(50)
  })

  it('rejoins to exactly the original text', () => {
    const text = 'y'.repeat(FOLD_CHARS + 17)
    const { visible, hidden } = splitAtFold(text)
    expect(visible + hidden).toBe(text)
  })

  // A post that is short but heavily line-broken still folds on LinkedIn:
  // the feed shows a few lines, whichever limit arrives first.
  it('folds on line count even when the text is short', () => {
    const text = Array.from({ length: FOLD_LINES + 3 }, (_, i) => `line ${i}`).join('\n')
    expect(countCharacters(text)).toBeLessThan(FOLD_CHARS)
    const result = splitAtFold(text)
    expect(result.folded).toBe(true)
    expect(result.visible.split('\n')).toHaveLength(FOLD_LINES)
  })

  it('folds at whichever limit comes first', () => {
    // Long lines: the character limit bites before the line limit.
    const text = ['x'.repeat(300), 'second line'].join('\n')
    const result = splitAtFold(text)
    expect(countCharacters(result.visible)).toBe(FOLD_CHARS)
  })

  it('does not split a surrogate pair across the fold', () => {
    const text = 'a'.repeat(FOLD_CHARS - 1) + '🚀' + 'b'.repeat(20)
    const { visible, hidden } = splitAtFold(text)
    expect(visible + hidden).toBe(text)
    // The rocket is one code point at the boundary; it must land whole on one
    // side, never as half a surrogate pair on each.
    expect(visible.endsWith('🚀')).toBe(true)
    expect(countCharacters(visible)).toBe(FOLD_CHARS)
  })
})
