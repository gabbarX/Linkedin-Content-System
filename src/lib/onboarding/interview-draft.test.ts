import { describe, expect, it } from 'vitest'
import { INTERVIEW_QUESTIONS, questionAt } from './questions'
import {
  applyDraftAnswer,
  hhmmToDate,
  normalizeAnswerValue,
  resumeIndexFromDraft,
  splitAnswersForPersistence,
  validateDraft,
  type InterviewDraft,
} from './interview-draft'

function question(field: string) {
  const found = INTERVIEW_QUESTIONS.find((q) => q.field === field)
  if (!found) throw new Error(`no question for field ${field}`)
  return found
}

/** Copies `draft` without `keys`, for asserting on a draft missing a field. */
function omit(draft: InterviewDraft, keys: string[]): InterviewDraft {
  return Object.fromEntries(Object.entries(draft).filter(([key]) => !keys.includes(key)))
}

describe('resumeIndexFromDraft', () => {
  it('resumes at 0 for a missing draft', () => {
    expect(resumeIndexFromDraft(null)).toBe(0)
  })

  it('resumes at 0 when the draft has no recorded position', () => {
    expect(resumeIndexFromDraft({})).toBe(0)
  })

  it('resumes at the recorded position', () => {
    expect(resumeIndexFromDraft({ _position: 3 })).toBe(3)
  })

  it('clamps a position past the last question', () => {
    expect(resumeIndexFromDraft({ _position: 999 })).toBe(INTERVIEW_QUESTIONS.length - 1)
  })

  it('clamps a negative or non-numeric position to 0', () => {
    expect(resumeIndexFromDraft({ _position: -1 })).toBe(0)
    expect(resumeIndexFromDraft({ _position: 'three' as unknown as number })).toBe(0)
  })
})

describe('normalizeAnswerValue', () => {
  it('trims a required text answer', () => {
    expect(normalizeAnswerValue(question('offer'), '  coaching for CTOs  ')).toBe(
      'coaching for CTOs',
    )
  })

  it('treats a blank optional answer as absent, not empty', () => {
    expect(normalizeAnswerValue(question('priceBand'), '   ')).toBeUndefined()
    expect(normalizeAnswerValue(question('priceBand'), '')).toBeUndefined()
  })

  it('splits a list answer on newlines and drops blank lines', () => {
    expect(normalizeAnswerValue(question('taboos'), 'politics\n\n  my old employer  \n')).toEqual(
      ['politics', 'my old employer'],
    )
  })

  it('returns an empty array, not undefined, when every line of a list answer is blank', () => {
    expect(normalizeAnswerValue(question('taboos'), '   \n  ')).toEqual([])
  })

  it('parses cadencePerWeek to a number', () => {
    expect(normalizeAnswerValue(question('cadencePerWeek'), '4')).toBe(4)
  })

  it('treats a blank cadencePerWeek as absent', () => {
    expect(normalizeAnswerValue(question('cadencePerWeek'), '')).toBeUndefined()
  })
})

describe('applyDraftAnswer', () => {
  it('adds a value and records the position without mutating the input draft', () => {
    const draft: InterviewDraft = {}
    const next = applyDraftAnswer(draft, 'offer', 'coaching for CTOs', 1)

    expect(next).toEqual({ offer: 'coaching for CTOs', _position: 1 })
    expect(draft).toEqual({})
  })

  it('removes the field when the value is undefined, but still records the position', () => {
    const draft: InterviewDraft = { priceBand: 'stale', _position: 0 }
    const next = applyDraftAnswer(draft, 'priceBand', undefined, 2)

    expect(next).toEqual({ _position: 2 })
    expect(next.priceBand).toBeUndefined()
  })

  it('overwrites an existing value for the same field', () => {
    const draft: InterviewDraft = { offer: 'old answer', _position: 0 }
    const next = applyDraftAnswer(draft, 'offer', 'new answer', 1)

    expect(next.offer).toBe('new answer')
  })
})

describe('validateDraft', () => {
  const completeDraft: InterviewDraft = {
    offer: 'Fractional CTO coaching',
    icp: 'Seed-stage founders',
    transformation: 'Ship without a coach in the room',
    taboos: [],
    cadencePerWeek: 4,
    preferredPostTime: '08:00',
    timezone: 'America/New_York',
  }

  it('succeeds on a fully answered draft and strips bookkeeping keys', () => {
    const result = validateDraft({ ...completeDraft, _position: 10 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.answers.offer).toBe('Fractional CTO coaching')
      expect(Object.keys(result.answers)).not.toContain('_position')
    }
  })

  it('fails on a draft missing a required field', () => {
    const result = validateDraft(omit(completeDraft, ['offer']))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.firstInvalidField).toBe('offer')
      expect(result.firstInvalidIndex).toBe(
        INTERVIEW_QUESTIONS.findIndex((q) => q.field === 'offer'),
      )
    }
  })

  it('points at the earliest offending question in interview order, not schema-issue order', () => {
    // transformation is later in INTERVIEW_QUESTIONS than icp; dropping both
    // should still resolve to icp because it comes first.
    const result = validateDraft(omit(completeDraft, ['icp', 'transformation']))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.firstInvalidField).toBe('icp')
    }
  })

  it('fails on a malformed value even when every field is present', () => {
    const result = validateDraft({ ...completeDraft, preferredPostTime: '25:00' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.firstInvalidField).toBe('preferredPostTime')
    }
  })
})

describe('hhmmToDate', () => {
  it('converts an HH:mm string to a UTC epoch-day Date', () => {
    expect(hhmmToDate('08:00').toISOString()).toBe('1970-01-01T08:00:00.000Z')
  })

  it('does not shift the hour based on the local machine offset', () => {
    // A regression guard for the exact bug the brief calls out: converting
    // via local time (`new Date('1970-01-01T08:00:00')`, no `Z`) would make
    // this assertion fail on any machine not running UTC.
    expect(hhmmToDate('23:45').getUTCHours()).toBe(23)
    expect(hhmmToDate('23:45').getUTCMinutes()).toBe(45)
  })
})

describe('splitAnswersForPersistence', () => {
  it('routes business_profiles fields and profiles fields into separate objects', () => {
    const draft: InterviewDraft = {
      offer: 'Fractional CTO coaching',
      icp: 'Seed-stage founders',
      transformation: 'Ship without a coach in the room',
      priceBand: '$4k-8k',
      proof: '12 clients, 3 acquisitions',
      pointOfView: 'Most CTOs over-hire',
      taboos: ['politics'],
      ctaTarget: 'Book a call',
      cadencePerWeek: 4,
      preferredPostTime: '08:00',
      timezone: 'America/New_York',
    }
    const validated = validateDraft(draft)
    expect(validated.success).toBe(true)
    if (!validated.success) return

    const { businessProfile, profile } = splitAnswersForPersistence(validated.answers)

    expect(businessProfile).toEqual({
      offer: 'Fractional CTO coaching',
      icp: 'Seed-stage founders',
      transformation: 'Ship without a coach in the room',
      priceBand: '$4k-8k',
      proof: '12 clients, 3 acquisitions',
      pointOfView: 'Most CTOs over-hire',
      taboos: ['politics'],
      ctaTarget: 'Book a call',
    })
    expect(profile.cadencePerWeek).toBe(4)
    expect(profile.timezone).toBe('America/New_York')
    expect(profile.preferredPostTime).toBeInstanceOf(Date)
    expect(profile.preferredPostTime.toISOString()).toBe('1970-01-01T08:00:00.000Z')
  })

  it('omits optional business_profiles fields the interview left unanswered', () => {
    const draft: InterviewDraft = {
      offer: 'Fractional CTO coaching',
      icp: 'Seed-stage founders',
      transformation: 'Ship without a coach in the room',
      taboos: [],
      cadencePerWeek: 3,
      preferredPostTime: '09:30',
      timezone: 'Europe/London',
    }
    const validated = validateDraft(draft)
    expect(validated.success).toBe(true)
    if (!validated.success) return

    const { businessProfile } = splitAnswersForPersistence(validated.answers)
    expect(businessProfile).toEqual({
      offer: 'Fractional CTO coaching',
      icp: 'Seed-stage founders',
      transformation: 'Ship without a coach in the room',
      taboos: [],
    })
    expect('priceBand' in businessProfile).toBe(false)
    expect('ctaTarget' in businessProfile).toBe(false)
  })
})

describe('questionAt sanity (guards the fixtures above)', () => {
  it('has a question at every index up to length - 1', () => {
    for (let i = 0; i < INTERVIEW_QUESTIONS.length; i += 1) {
      expect(questionAt(i)).toBeDefined()
    }
  })
})
