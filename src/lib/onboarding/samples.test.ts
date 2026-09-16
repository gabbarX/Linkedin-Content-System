import { describe, expect, it } from 'vitest'
import {
  PASTE_MAX,
  PASTE_MIN,
  SAMPLES_RULE_MESSAGE,
  WRITTEN_MIN,
  countBySource,
  countsSatisfyRule,
  samplesSatisfyRule,
  samplesSubmissionSchema,
  splitPastedText,
} from './samples'

function pasted(n: number) {
  return Array.from({ length: n }, (_, i) => ({ source: 'pasted' as const, content: `post ${i}` }))
}

function written(n: number) {
  return Array.from({ length: n }, (_, i) => ({ source: 'written' as const, content: `post ${i}` }))
}

describe('countBySource', () => {
  it('counts pasted and written separately', () => {
    expect(countBySource([...pasted(3), ...written(2)])).toEqual({ pasted: 3, written: 2 })
  })

  it('returns zeros for an empty list', () => {
    expect(countBySource([])).toEqual({ pasted: 0, written: 0 })
  })
})

describe('countsSatisfyRule / samplesSatisfyRule', () => {
  it('rejects fewer than the pasted minimum with no written samples', () => {
    expect(countsSatisfyRule({ pasted: PASTE_MIN - 1, written: 0 })).toBe(false)
  })

  it('accepts exactly the pasted minimum', () => {
    expect(countsSatisfyRule({ pasted: PASTE_MIN, written: 0 })).toBe(true)
  })

  it('accepts exactly the pasted maximum', () => {
    expect(countsSatisfyRule({ pasted: PASTE_MAX, written: 0 })).toBe(true)
  })

  it('rejects more than the pasted maximum with no written samples', () => {
    expect(countsSatisfyRule({ pasted: PASTE_MAX + 1, written: 0 })).toBe(false)
  })

  it('rejects fewer than the written minimum with no pasted samples', () => {
    expect(countsSatisfyRule({ pasted: 0, written: WRITTEN_MIN - 1 })).toBe(false)
  })

  it('accepts exactly the written minimum', () => {
    expect(countsSatisfyRule({ pasted: 0, written: WRITTEN_MIN })).toBe(true)
  })

  it('accepts more than the written minimum', () => {
    expect(countsSatisfyRule({ pasted: 0, written: WRITTEN_MIN + 5 })).toBe(true)
  })

  it('accepts the written path even when pasted count alone would fail', () => {
    // 2 pasted (below the pasted minimum) plus 2 written (meets the written
    // minimum) must still pass -- the written path does not require zero
    // pasted samples.
    expect(samplesSatisfyRule([...pasted(2), ...written(WRITTEN_MIN)])).toBe(true)
  })

  it('rejects an empty submission', () => {
    expect(samplesSatisfyRule([])).toBe(false)
  })
})

describe('samplesSubmissionSchema', () => {
  it('rejects a submission that satisfies neither path, with the shared rule message', () => {
    const result = samplesSubmissionSchema.safeParse({ samples: pasted(3) })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === SAMPLES_RULE_MESSAGE)).toBe(
        true,
      )
    }
  })

  it('accepts a valid pasted submission', () => {
    const result = samplesSubmissionSchema.safeParse({ samples: pasted(PASTE_MIN) })
    expect(result.success).toBe(true)
  })

  it('accepts a valid written submission', () => {
    const result = samplesSubmissionSchema.safeParse({ samples: written(WRITTEN_MIN) })
    expect(result.success).toBe(true)
  })

  it('rejects an entry with blank content even when counts would otherwise pass', () => {
    const samples = [...pasted(PASTE_MIN - 1), { source: 'pasted' as const, content: '   ' }]
    const result = samplesSubmissionSchema.safeParse({ samples })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown source', () => {
    const result = samplesSubmissionSchema.safeParse({
      samples: [{ source: 'imported', content: 'x' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('splitPastedText', () => {
  it('splits on a line of exactly three dashes', () => {
    expect(splitPastedText('first post\n---\nsecond post')).toEqual(['first post', 'second post'])
  })

  it('splits on a longer dash rule', () => {
    expect(splitPastedText('first\n------\nsecond')).toEqual(['first', 'second'])
  })

  it('does not split on a blank line -- a real post has paragraph breaks', () => {
    const text = 'First paragraph.\n\nSecond paragraph of the same post.'
    expect(splitPastedText(text)).toEqual([text])
  })

  it('returns one sample for text with no separator at all', () => {
    expect(splitPastedText('just one post, nothing else')).toEqual(['just one post, nothing else'])
  })

  it('trims surrounding whitespace from each split sample', () => {
    expect(splitPastedText('  first  \n---\n  second  ')).toEqual(['first', 'second'])
  })

  it('drops empty chunks -- a leading, trailing or doubled separator', () => {
    expect(splitPastedText('---\nfirst\n---\n---\nsecond\n---')).toEqual(['first', 'second'])
  })

  it('returns an empty array for blank input', () => {
    expect(splitPastedText('   \n\n  ')).toEqual([])
  })

  it('preserves multi-paragraph structure within one split-out post', () => {
    const text = 'Line one.\n\nLine two.\n---\nSecond post, one line.'
    expect(splitPastedText(text)).toEqual(['Line one.\n\nLine two.', 'Second post, one line.'])
  })
})
