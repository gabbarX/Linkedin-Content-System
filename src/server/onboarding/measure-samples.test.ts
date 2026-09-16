import { describe, expect, it } from 'vitest'
import { measureSample, measureSamples } from './measure-samples'

/**
 * measureSamples() is pure arithmetic over text -- properly testable, unlike
 * the model call in derive-voice.ts. Spec §7 calls a "returned a non-empty
 * string" assertion theatre; nothing here is that. These tests come from
 * task-4-brief.md verbatim (Step 1), plus coverage for measureSample() added
 * per ruling R1 (see progress.md) since a later task stores per-sample counts
 * in the writing_samples columns and needs the singular function.
 */

describe('measureSamples', () => {
  it('measures average and maximum sentence length in words', () => {
    const m = measureSamples(['Short one. This sentence is noticeably longer than that one.'])
    expect(m.avgSentenceLength).toBeCloseTo(5.5, 1)
    expect(m.maxSentenceLength).toBe(9)
  })

  it('counts emoji by code point, not by UTF-16 unit', () => {
    // '🚀'.length === 2. A naive character loop double-counts every emoji and
    // reports 'frequent' for a user who used two.
    expect(measureSamples(['Ship it 🚀🎉']).emojiCount).toBe(2)
  })

  it('classifies line-break style from paragraph length', () => {
    expect(measureSamples(['a\n\nb\n\nc']).lineBreakStyle).toBe('single-line')
  })

  it('derives hashtag policy from frequency per post, not total count', () => {
    expect(measureSamples(['#a #b #c #d #e']).hashtagPolicy).toBe('frequent')
    expect(measureSamples(['no tags here', 'still none']).hashtagPolicy).toBe('none')
  })

  it('ignores empty and whitespace-only samples rather than dividing by zero', () => {
    expect(() => measureSamples(['   ', ''])).not.toThrow()
  })

  it('classifies a grouped paragraph style from a multi-line paragraph', () => {
    const m = measureSamples(['Line one.\nLine two.\nLine three.'])
    expect(m.avgParagraphLines).toBe(3)
    expect(m.lineBreakStyle).toBe('grouped')
  })

  it('classifies sparing emoji use below the frequent threshold', () => {
    const m = measureSamples(['One emoji here 🎉', 'None here'])
    expect(m.emojiCount).toBe(1)
    expect(m.emojiPolicy).toBe('sparing')
  })

  it('aggregates sentence and paragraph statistics across multiple samples', () => {
    const m = measureSamples(['One. Two words here.', 'Three word sentence now.'])
    // Sample 1: 'One' -> 1 word, ' Two words here' -> 4 words (leading space
    // from the clause split counts as a token -- see measure-samples.ts).
    // Sample 2: 'Three word sentence now' -> 4 words.
    expect(m.maxSentenceLength).toBe(4)
    expect(m.avgSentenceLength).toBeCloseTo(3, 5)
  })
})

describe('measureSample', () => {
  it('counts words, characters, and lines for a single-line sample', () => {
    const c = measureSample('Hello world')
    expect(c.wordCount).toBe(2)
    expect(c.charCount).toBe(11)
    expect(c.lineCount).toBe(1)
    expect(c.emojiCount).toBe(0)
    expect(c.hashtagCount).toBe(0)
  })

  it('counts lines by newline, not by sentence', () => {
    expect(measureSample('a\nb\nc').lineCount).toBe(3)
  })

  it('counts emoji and hashtags independently of word count', () => {
    const c = measureSample('Ship it 🚀🎉 #launch #b2b')
    expect(c.emojiCount).toBe(2)
    expect(c.hashtagCount).toBe(2)
  })

  it('counts characters by code point so a multi-unit emoji counts once', () => {
    // '🚀'.length === 2 in UTF-16; Array.from-style counting must still see 1.
    const c = measureSample('🚀')
    expect(c.charCount).toBe(1)
  })

  it('returns all-zero counts for an empty string rather than throwing', () => {
    expect(() => measureSample('')).not.toThrow()
    const c = measureSample('')
    expect(c.wordCount).toBe(0)
    expect(c.emojiCount).toBe(0)
    expect(c.hashtagCount).toBe(0)
  })
})
