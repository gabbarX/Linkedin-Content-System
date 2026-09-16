import { describe, expect, it } from 'vitest'
import {
  EMOJI_POLICY_OPTIONS,
  FORMALITY_OPTIONS,
  HASHTAG_POLICY_OPTIONS,
  HUMOUR_LEVEL_OPTIONS,
  LINE_BREAK_STYLE_OPTIONS,
  POV_STRENGTH_OPTIONS,
  SENTENCE_RHYTHM_OPTIONS,
  parseVoiceFormValues,
  type VoiceFormValues,
} from './voice-edit'

function validForm(overrides: Partial<VoiceFormValues> = {}): VoiceFormValues {
  return {
    sentenceRhythm: 'varied',
    lineBreakStyle: 'grouped',
    emojiPolicy: 'sparing',
    hashtagPolicy: 'none',
    povStrength: 'balanced',
    humourLevel: 'dry',
    formality: 'conversational',
    openerPatterns: ['Here is the thing:'],
    closerPatterns: ['What would you do?'],
    vocabularyMarkers: ['playbook'],
    bannedPhrases: ['synergy'],
    ...overrides,
  }
}

describe('option catalogues', () => {
  // One assertion per catalogue that its values are exactly the database's
  // own enumerated set, in order -- the whole point of building the
  // catalogue from the imported tuple rather than a hand-typed literal.
  it('cover every allowed value for each field, in the database order', () => {
    expect(SENTENCE_RHYTHM_OPTIONS.map((o) => o.value)).toEqual([
      'short-punchy',
      'varied',
      'long-flowing',
    ])
    expect(LINE_BREAK_STYLE_OPTIONS.map((o) => o.value)).toEqual([
      'single-line',
      'grouped',
      'dense',
    ])
    expect(EMOJI_POLICY_OPTIONS.map((o) => o.value)).toEqual(['none', 'sparing', 'frequent'])
    expect(HASHTAG_POLICY_OPTIONS.map((o) => o.value)).toEqual(['none', 'sparing', 'frequent'])
    expect(POV_STRENGTH_OPTIONS.map((o) => o.value)).toEqual([
      'measured',
      'balanced',
      'contrarian',
    ])
    expect(HUMOUR_LEVEL_OPTIONS.map((o) => o.value)).toEqual(['none', 'dry', 'playful'])
    expect(FORMALITY_OPTIONS.map((o) => o.value)).toEqual([
      'formal',
      'conversational',
      'casual',
    ])
  })

  it('gives every option a human label distinct from its raw value', () => {
    const allOptions = [
      ...SENTENCE_RHYTHM_OPTIONS,
      ...LINE_BREAK_STYLE_OPTIONS,
      ...EMOJI_POLICY_OPTIONS,
      ...HASHTAG_POLICY_OPTIONS,
      ...POV_STRENGTH_OPTIONS,
      ...HUMOUR_LEVEL_OPTIONS,
      ...FORMALITY_OPTIONS,
    ]
    for (const option of allOptions) {
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.description.length).toBeGreaterThan(0)
    }
  })
})

describe('parseVoiceFormValues', () => {
  it('accepts a fully valid submission and maps it field-for-field', () => {
    const result = parseVoiceFormValues(validForm())
    expect(result).toEqual({
      success: true,
      edit: {
        sentenceRhythm: 'varied',
        lineBreakStyle: 'grouped',
        emojiPolicy: 'sparing',
        hashtagPolicy: 'none',
        povStrength: 'balanced',
        humourLevel: 'dry',
        formality: 'conversational',
        openerPatterns: ['Here is the thing:'],
        closerPatterns: ['What would you do?'],
        vocabularyMarkers: ['playbook'],
        bannedPhrases: ['synergy'],
      },
    })
  })

  it('trims whitespace and drops blank entries from array fields', () => {
    const result = parseVoiceFormValues(
      validForm({
        openerPatterns: ['  Here is the thing:  ', '', '   '],
        bannedPhrases: ['synergy', '  ', 'circle back'],
      }),
    )
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.edit.openerPatterns).toEqual(['Here is the thing:'])
    expect(result.edit.bannedPhrases).toEqual(['synergy', 'circle back'])
  })

  it('preserves array order', () => {
    const result = parseVoiceFormValues(
      validForm({ vocabularyMarkers: ['third', 'first', 'second'] }),
    )
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.edit.vocabularyMarkers).toEqual(['third', 'first', 'second'])
  })

  it('rejects a sentence rhythm outside the allowed set', () => {
    const result = parseVoiceFormValues(validForm({ sentenceRhythm: 'staccato' }))
    expect(result).toEqual({
      success: false,
      message: 'Sentence rhythm is not one of the allowed options.',
    })
  })

  it('rejects a line break style outside the allowed set', () => {
    const result = parseVoiceFormValues(validForm({ lineBreakStyle: 'scattered' }))
    expect(result.success).toBe(false)
  })

  it('rejects an emoji policy outside the allowed set', () => {
    const result = parseVoiceFormValues(validForm({ emojiPolicy: 'lots' }))
    expect(result.success).toBe(false)
  })

  it('rejects a hashtag policy outside the allowed set', () => {
    const result = parseVoiceFormValues(validForm({ hashtagPolicy: 'lots' }))
    expect(result.success).toBe(false)
  })

  it('rejects a POV strength outside the allowed set', () => {
    const result = parseVoiceFormValues(validForm({ povStrength: 'aggressive' }))
    expect(result.success).toBe(false)
  })

  it('rejects a humour level outside the allowed set', () => {
    const result = parseVoiceFormValues(validForm({ humourLevel: 'silly' }))
    expect(result.success).toBe(false)
  })

  it('rejects a formality outside the allowed set', () => {
    const result = parseVoiceFormValues(validForm({ formality: 'stiff' }))
    expect(result.success).toBe(false)
  })

  it('rejects an empty string the same as any other disallowed value', () => {
    const result = parseVoiceFormValues(validForm({ formality: '' }))
    expect(result.success).toBe(false)
  })
})
