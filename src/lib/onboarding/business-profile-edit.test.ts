import { describe, expect, it } from 'vitest'
import { FIELD_COLUMNS, INTERVIEW_QUESTIONS } from './questions'
import {
  BUSINESS_PROFILE_QUESTIONS,
  businessProfileSchema,
  businessProfileToFormValues,
  parseBusinessProfileFormValues,
  type BusinessProfileFormValues,
} from './business-profile-edit'

function validForm(overrides: Partial<BusinessProfileFormValues> = {}): BusinessProfileFormValues {
  return {
    offer: '12-week fractional CMO engagement',
    priceBand: '$6k-9k/mo',
    icp: 'Series A B2B SaaS founders without a marketing hire',
    transformation: 'A pipeline that does not depend on the founder personally',
    proof: '3x pipeline in 90 days for two clients',
    pointOfView: 'Most B2B marketing advice is written for enterprise, not seed-stage',
    taboos: ['politics', 'a past employer'],
    ctaTarget: 'Book a call: example.com/call',
    ...overrides,
  }
}

describe('BUSINESS_PROFILE_QUESTIONS', () => {
  it('is exactly the interview questions that persist to business_profiles, in order', () => {
    const expected = INTERVIEW_QUESTIONS.filter(
      (q) => FIELD_COLUMNS[q.field].table === 'business_profiles',
    ).map((q) => q.field)
    expect(BUSINESS_PROFILE_QUESTIONS.map((q) => q.field)).toEqual(expected)
  })

  it('excludes the three fields that persist to profiles', () => {
    const fields = BUSINESS_PROFILE_QUESTIONS.map((q) => q.field)
    expect(fields).not.toContain('cadencePerWeek')
    expect(fields).not.toContain('preferredPostTime')
    expect(fields).not.toContain('timezone')
  })

  it('covers all 8 business_profiles columns exactly once', () => {
    const fields = BUSINESS_PROFILE_QUESTIONS.map((q) => q.field).sort()
    expect(fields).toEqual(
      ['ctaTarget', 'icp', 'offer', 'pointOfView', 'priceBand', 'proof', 'taboos', 'transformation'].sort(),
    )
  })
})

describe('businessProfileSchema', () => {
  // I2: businessProfileSchema's pick mask is derived from
  // BUSINESS_PROFILE_QUESTIONS so the two cannot drift apart, but this
  // contract test re-derives the guarantee from the schema's own public
  // shape rather than relying on that being true by construction -- it
  // would still catch a hand-typed mask silently falling out of step,
  // which is exactly the failure mode I2 flagged (a field the schema
  // strips is written as `null` by upsertBusinessProfile's full replace on
  // every subsequent settings save).
  it('validates exactly the business-profile questions, no more and no fewer', () => {
    expect(Object.keys(businessProfileSchema.shape).sort()).toEqual(
      BUSINESS_PROFILE_QUESTIONS.map((q) => q.field).sort(),
    )
  })
})

describe('businessProfileToFormValues', () => {
  it('maps a saved profile field-for-field', () => {
    const values = businessProfileToFormValues({
      offer: 'Fractional CMO',
      priceBand: '$5k/mo',
      icp: 'Seed-stage founders',
      transformation: 'A repeatable pipeline',
      proof: 'Case study X',
      pointOfView: 'Contrarian take',
      taboos: ['a competitor'],
      ctaTarget: 'DM me',
    })
    expect(values).toEqual({
      offer: 'Fractional CMO',
      priceBand: '$5k/mo',
      icp: 'Seed-stage founders',
      transformation: 'A repeatable pipeline',
      proof: 'Case study X',
      pointOfView: 'Contrarian take',
      taboos: ['a competitor'],
      ctaTarget: 'DM me',
    })
  })

  it('turns null optional columns into empty strings, not the literal null', () => {
    const values = businessProfileToFormValues({
      offer: 'Fractional CMO',
      priceBand: null,
      icp: 'Seed-stage founders',
      transformation: 'A repeatable pipeline',
      proof: null,
      pointOfView: null,
      taboos: [],
      ctaTarget: null,
    })
    expect(values.priceBand).toBe('')
    expect(values.proof).toBe('')
    expect(values.pointOfView).toBe('')
    expect(values.ctaTarget).toBe('')
    expect(values.taboos).toEqual([])
  })

  it('is a blank form for a user with no business_profiles row yet', () => {
    const values = businessProfileToFormValues(null)
    expect(values).toEqual({
      offer: '',
      priceBand: '',
      icp: '',
      transformation: '',
      proof: '',
      pointOfView: '',
      taboos: [],
      ctaTarget: '',
    })
  })
})

describe('parseBusinessProfileFormValues', () => {
  it('accepts a fully valid submission and maps it field-for-field', () => {
    const result = parseBusinessProfileFormValues(validForm())
    expect(result).toEqual({
      success: true,
      edit: {
        offer: '12-week fractional CMO engagement',
        priceBand: '$6k-9k/mo',
        icp: 'Series A B2B SaaS founders without a marketing hire',
        transformation: 'A pipeline that does not depend on the founder personally',
        proof: '3x pipeline in 90 days for two clients',
        pointOfView: 'Most B2B marketing advice is written for enterprise, not seed-stage',
        taboos: ['politics', 'a past employer'],
        ctaTarget: 'Book a call: example.com/call',
      },
    })
  })

  it('trims whitespace on every string field', () => {
    const result = parseBusinessProfileFormValues(
      validForm({ offer: '  Fractional CMO  ', ctaTarget: '  DM me  ' }),
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.edit.offer).toBe('Fractional CMO')
      expect(result.edit.ctaTarget).toBe('DM me')
    }
  })

  it('drops blank entries and trims each item in taboos', () => {
    const result = parseBusinessProfileFormValues(
      validForm({ taboos: ['  politics  ', '', '   ', 'a past employer'] }),
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.edit.taboos).toEqual(['politics', 'a past employer'])
    }
  })

  it('accepts an empty taboos list -- having none is valid', () => {
    const result = parseBusinessProfileFormValues(validForm({ taboos: [] }))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.edit.taboos).toEqual([])
    }
  })

  it('omits blank optional fields rather than rejecting them', () => {
    const result = parseBusinessProfileFormValues(
      validForm({ priceBand: '', proof: '', pointOfView: '', ctaTarget: '' }),
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.edit.priceBand).toBeUndefined()
      expect(result.edit.proof).toBeUndefined()
      expect(result.edit.pointOfView).toBeUndefined()
      expect(result.edit.ctaTarget).toBeUndefined()
    }
  })

  it('rejects a blank required field: offer', () => {
    const result = parseBusinessProfileFormValues(validForm({ offer: '   ' }))
    expect(result.success).toBe(false)
  })

  it('rejects a blank required field: icp', () => {
    const result = parseBusinessProfileFormValues(validForm({ icp: '' }))
    expect(result.success).toBe(false)
  })

  it('rejects a blank required field: transformation', () => {
    const result = parseBusinessProfileFormValues(validForm({ transformation: '' }))
    expect(result.success).toBe(false)
  })

  it('rejects a null value for a required scalar field from a crafted request, as a typed rejection not a throw', () => {
    expect(() =>
      parseBusinessProfileFormValues(validForm({ offer: null as unknown as string })),
    ).not.toThrow()
    const result = parseBusinessProfileFormValues(validForm({ offer: null as unknown as string }))
    expect(result).toEqual({ success: false, message: 'The "offer" field must be text.' })
  })

  it('rejects a numeric value for a required scalar field from a crafted request, as a typed rejection not a throw', () => {
    expect(() =>
      parseBusinessProfileFormValues(validForm({ transformation: 42 as unknown as string })),
    ).not.toThrow()
    const result = parseBusinessProfileFormValues(
      validForm({ transformation: 42 as unknown as string }),
    )
    expect(result).toEqual({ success: false, message: 'The "transformation" field must be text.' })
  })

  it('rejects a null value for an optional scalar field from a crafted request, as a typed rejection not a throw', () => {
    expect(() =>
      parseBusinessProfileFormValues(validForm({ priceBand: null as unknown as string })),
    ).not.toThrow()
    const result = parseBusinessProfileFormValues(
      validForm({ priceBand: null as unknown as string }),
    )
    expect(result).toEqual({ success: false, message: 'The "priceBand" field must be text.' })
  })

  it('rejects a numeric value for an optional scalar field from a crafted request, as a typed rejection not a throw', () => {
    expect(() =>
      parseBusinessProfileFormValues(validForm({ ctaTarget: 7 as unknown as string })),
    ).not.toThrow()
    const result = parseBusinessProfileFormValues(validForm({ ctaTarget: 7 as unknown as string }))
    expect(result).toEqual({ success: false, message: 'The "ctaTarget" field must be text.' })
  })

  it('rejects a non-array taboos value from a crafted request', () => {
    const result = parseBusinessProfileFormValues(
      validForm({ taboos: 'politics' as unknown as string[] }),
    )
    expect(result).toEqual({ success: false, message: 'Taboos must be a list of text.' })
  })

  it('rejects a taboos array containing a non-string element from a crafted request', () => {
    const result = parseBusinessProfileFormValues(
      validForm({ taboos: [1, 2] as unknown as string[] }),
    )
    expect(result).toEqual({ success: false, message: 'Taboos must be a list of text.' })
  })
})
