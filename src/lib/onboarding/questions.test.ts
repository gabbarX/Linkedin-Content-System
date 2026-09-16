import { describe, expect, it } from 'vitest'
import {
  FIELD_COLUMNS,
  INTERVIEW_QUESTIONS,
  INTERVIEW_TOPICS,
  interviewAnswersSchema,
  questionAt,
} from './questions'

/**
 * The nine topics from spec §4.1, in the exact order they appear there.
 * Two of them ("offer and price band", "preferred posting time and
 * timezone") answer to two different database columns each, so they are
 * built as two adjacent questions sharing one topic rather than one
 * question with two values — see questions.ts for why.
 */
const SPEC_TOPICS = [
  'offer-and-price-band',
  'icp',
  'transformation',
  'proof-and-results',
  'point-of-view',
  'taboos',
  'cta-target',
  'cadence',
  'posting-time-and-timezone',
]

describe('INTERVIEW_QUESTIONS', () => {
  it('covers every spec §4.1 topic exactly once', () => {
    const topicsInOrder = INTERVIEW_QUESTIONS.map((q) => q.topic)
    // Adjacent duplicates collapse (a topic answered by two consecutive
    // questions still counts once); a topic answered non-contiguously, or
    // missing, or extra, fails this.
    const dedupedInOrder = topicsInOrder.filter(
      (topic, i) => topic !== topicsInOrder[i - 1],
    )
    expect(dedupedInOrder).toEqual(SPEC_TOPICS)
  })

  it('maps every answer field to a business_profiles column or a profiles column', () => {
    const expectedColumns: Record<string, { table: 'business_profiles' | 'profiles'; column: string }> = {
      offer: { table: 'business_profiles', column: 'offer' },
      priceBand: { table: 'business_profiles', column: 'price_band' },
      icp: { table: 'business_profiles', column: 'icp' },
      transformation: { table: 'business_profiles', column: 'transformation' },
      proof: { table: 'business_profiles', column: 'proof' },
      pointOfView: { table: 'business_profiles', column: 'point_of_view' },
      taboos: { table: 'business_profiles', column: 'taboos' },
      ctaTarget: { table: 'business_profiles', column: 'cta_target' },
      cadencePerWeek: { table: 'profiles', column: 'cadence_per_week' },
      preferredPostTime: { table: 'profiles', column: 'preferred_post_time' },
      timezone: { table: 'profiles', column: 'timezone' },
    }

    expect(FIELD_COLUMNS).toEqual(expectedColumns)

    for (const question of INTERVIEW_QUESTIONS) {
      expect(FIELD_COLUMNS[question.field]).toBeDefined()
    }
  })

  it('offers only cadences the database accepts', () => {
    // profiles.cadence_per_week has a 3-5 check constraint. An option outside
    // it reaches the user as a choice and fails on save.
    const cadenceQuestion = INTERVIEW_QUESTIONS.find((q) => q.field === 'cadencePerWeek')
    expect(cadenceQuestion).toBeDefined()
    expect(cadenceQuestion?.input).toBe('choice')
    expect(cadenceQuestion?.options?.map((o) => o.value)).toEqual([3, 4, 5])
  })

  it('gives every question a unique id and a unique field', () => {
    const ids = INTERVIEW_QUESTIONS.map((q) => q.id)
    const fields = INTERVIEW_QUESTIONS.map((q) => q.field)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('only carries options on a choice question', () => {
    for (const question of INTERVIEW_QUESTIONS) {
      if (question.input === 'choice') {
        expect(question.options?.length).toBeGreaterThan(0)
      } else {
        expect(question.options).toBeUndefined()
      }
    }
  })

  it('marks the NOT NULL business_profiles columns and the profiles preferences as required', () => {
    const requiredFields = INTERVIEW_QUESTIONS.filter((q) => q.required).map((q) => q.field)
    expect(requiredFields).toEqual([
      'offer',
      'icp',
      'transformation',
      'cadencePerWeek',
      'preferredPostTime',
      'timezone',
    ])
  })
})

describe('questionAt', () => {
  it('returns the question at that index', () => {
    expect(questionAt(0)).toBe(INTERVIEW_QUESTIONS[0])
  })

  it('returns undefined past the end, rather than throwing', () => {
    expect(questionAt(INTERVIEW_QUESTIONS.length)).toBeUndefined()
    expect(questionAt(-1)).toBeUndefined()
  })
})

describe('interviewAnswersSchema', () => {
  const validAnswers = {
    offer: 'Fractional COO retainer for seed-stage SaaS founders',
    priceBand: '$4k-8k/mo',
    icp: 'Seed-stage SaaS founders, 5-20 employees, just raised a round',
    transformation: 'They stop being the bottleneck and the team ships without them',
    proof: '12 clients, average 30% faster hiring cycle',
    pointOfView: 'Most "operator" advice is really just delegation with extra steps',
    taboos: ['naming past clients', 'politics'],
    ctaTarget: 'Book a call: cal.com/example',
    cadencePerWeek: 3,
    preferredPostTime: '08:00',
    timezone: 'America/New_York',
  }

  it('accepts a fully answered interview', () => {
    expect(interviewAnswersSchema.parse(validAnswers)).toEqual(validAnswers)
  })

  it('accepts the optional fields being omitted', () => {
    const { priceBand, proof, pointOfView, ctaTarget, taboos, ...required } = validAnswers
    void priceBand
    void proof
    void pointOfView
    void ctaTarget
    void taboos
    expect(interviewAnswersSchema.parse({ ...required, taboos: [] })).toEqual({
      ...required,
      taboos: [],
    })
  })

  it('rejects a blank required field', () => {
    expect(() => interviewAnswersSchema.parse({ ...validAnswers, offer: '  ' })).toThrow()
  })

  it('rejects a cadence outside the 3-5 check constraint', () => {
    expect(() => interviewAnswersSchema.parse({ ...validAnswers, cadencePerWeek: 6 })).toThrow()
  })

  it('rejects a malformed preferred post time', () => {
    expect(() =>
      interviewAnswersSchema.parse({ ...validAnswers, preferredPostTime: '8am' }),
    ).toThrow()
  })

  it('rejects a blank timezone', () => {
    expect(() => interviewAnswersSchema.parse({ ...validAnswers, timezone: '' })).toThrow()
  })
})

describe('INTERVIEW_TOPICS', () => {
  it('matches spec §4.1, in order', () => {
    expect(INTERVIEW_TOPICS).toEqual(SPEC_TOPICS)
  })
})
