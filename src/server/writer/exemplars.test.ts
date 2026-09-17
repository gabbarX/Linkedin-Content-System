import { describe, expect, it } from 'vitest'
import type { WritingSample } from '@/server/db/repositories/writing-samples'
import { EXEMPLAR_COUNT, featuresOf, selectExemplars } from './exemplars'

/**
 * Exemplar matching uses format and structure heuristics, not vectors — spec
 * §3.2, which stands even now that Gemini could serve embeddings: "the v1
 * decision stands until heuristics are measured and found wanting".
 *
 * This is the part of the writer worth testing. It is pure, it is arithmetic
 * over the user's own samples, and if it silently returns the wrong three the
 * output degrades in a way nobody would trace back here.
 */

let nextId = 0
function sample(content: string): WritingSample {
  nextId += 1
  return {
    id: `sample-${nextId}`,
    userId: 'user-1',
    content,
    source: 'pasted',
    wordCount: content.split(/\s+/).length,
    charCount: Array.from(content).length,
    lineCount: content.split('\n').length,
    emojiCount: 0,
    hashtagCount: 0,
    createdAt: new Date(),
  }
}

const listPost = ['Three things I learned:', '1. One thing', '2. Another', '3. A third'].join('\n')
const questionPost = 'What would you do with an extra day a week?\n\nMost founders say rest.'
const numberPost = '47% of the agencies I audited had no delivery lead.\n\nHere is what that costs.'
const narrativePost =
  'I sat in a boardroom last March and watched a founder realise the problem was him.\n\nHe had built every process around his own judgement.\n\nIt took nine months to undo.'

describe('featuresOf', () => {
  it('classifies a numbered list as a list', () => {
    expect(featuresOf(sample(listPost)).structure).toBe('list')
  })

  it('classifies a bulleted list as a list', () => {
    const bulleted = ['What I check:', '- delivery lead', '- margin', '- churn'].join('\n')
    expect(featuresOf(sample(bulleted)).structure).toBe('list')
  })

  it('classifies flowing paragraphs as narrative', () => {
    expect(featuresOf(sample(narrativePost)).structure).toBe('narrative')
  })

  it('does not call a single numbered line a list', () => {
    const notAList = '1 thing changed everything.\n\nIt was the hiring order.'
    expect(featuresOf(sample(notAList)).structure).toBe('narrative')
  })

  it('reads a question opener', () => {
    expect(featuresOf(sample(questionPost)).openerType).toBe('question')
  })

  it('reads a number opener', () => {
    expect(featuresOf(sample(numberPost)).openerType).toBe('number')
  })

  it('reads anything else as a statement', () => {
    expect(featuresOf(sample(narrativePost)).openerType).toBe('statement')
  })

  it('bands length', () => {
    expect(featuresOf(sample('x'.repeat(100))).lengthBand).toBe('short')
    expect(featuresOf(sample('x'.repeat(1000))).lengthBand).toBe('medium')
    expect(featuresOf(sample('x'.repeat(2500))).lengthBand).toBe('long')
  })

  it('counts paragraphs, not lines', () => {
    expect(featuresOf(sample('one\ntwo\n\nthree')).paragraphCount).toBe(2)
  })
})

describe('selectExemplars', () => {
  it('returns nothing when the user has no samples', () => {
    expect(selectExemplars([], 'story')).toEqual([])
  })

  // The "2 written samples" onboarding path is legitimate and leaves a user
  // with fewer samples than we would like. Taking what exists beats refusing.
  it('takes what exists when the user has fewer than three samples', () => {
    const samples = [sample(narrativePost), sample(listPost)]
    expect(selectExemplars(samples, 'story')).toHaveLength(2)
  })

  it('never returns more than the exemplar count', () => {
    const samples = Array.from({ length: 10 }, () => sample(narrativePost))
    expect(selectExemplars(samples, 'story')).toHaveLength(EXEMPLAR_COUNT)
  })

  it('prefers a list-shaped sample when writing a list', () => {
    const narrative = sample(narrativePost)
    const list = sample(listPost)
    const [first] = selectExemplars([narrative, list], 'list', 1)
    expect(first?.id).toBe(list.id)
  })

  it('prefers a narrative sample when writing a story', () => {
    const narrative = sample(narrativePost)
    const list = sample(listPost)
    const [first] = selectExemplars([list, narrative], 'story', 1)
    expect(first?.id).toBe(narrative.id)
  })

  it('prefers a question opener when writing a question post', () => {
    const question = sample(questionPost)
    const statement = sample(narrativePost)
    const [first] = selectExemplars([statement, question], 'question', 1)
    expect(first?.id).toBe(question.id)
  })

  it('prefers a number opener when writing a case study', () => {
    const number = sample(numberPost)
    const question = sample(questionPost)
    const [first] = selectExemplars([question, number], 'case-study', 1)
    expect(first?.id).toBe(number.id)
  })

  // Determinism matters: the same inputs must choose the same exemplars, or
  // two regenerations differ for a reason nobody can see.
  it('is deterministic and stable for equally good candidates', () => {
    const a = sample(narrativePost)
    const b = sample(narrativePost)
    const c = sample(narrativePost)
    const first = selectExemplars([a, b, c], 'story')
    const second = selectExemplars([a, b, c], 'story')
    expect(first.map((s) => s.id)).toEqual(second.map((s) => s.id))
    expect(first.map((s) => s.id)).toEqual([a.id, b.id, c.id])
  })
})
