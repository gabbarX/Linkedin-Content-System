import { describe, expect, it } from 'vitest'
import {
  ARC_PHASES,
  FORMAT_META,
  MAX_PILLARS,
  MIN_PILLARS,
  PHASE_META,
  SLOT_FORMATS,
  WEEKS_IN_STRATEGY,
  phaseForWeek,
  weeksForPhase,
} from './vocabulary'

describe('the arc', () => {
  it('runs authority → problem-aware → offer-aware → invitation, in that order (spec §4.2)', () => {
    expect(ARC_PHASES).toEqual(['authority', 'problem-aware', 'offer-aware', 'invitation'])
  })

  it('is twelve weeks, three per phase', () => {
    expect(WEEKS_IN_STRATEGY).toBe(12)
    for (const phase of ARC_PHASES) {
      expect(weeksForPhase(phase)).toHaveLength(3)
    }
  })

  it('maps every week to exactly one phase, and back', () => {
    for (let week = 1; week <= WEEKS_IN_STRATEGY; week++) {
      const phase = phaseForWeek(week)
      expect(weeksForPhase(phase)).toContain(week)
    }
    expect(phaseForWeek(1)).toBe('authority')
    expect(phaseForWeek(3)).toBe('authority')
    expect(phaseForWeek(4)).toBe('problem-aware')
    expect(phaseForWeek(7)).toBe('offer-aware')
    expect(phaseForWeek(10)).toBe('invitation')
    expect(phaseForWeek(12)).toBe('invitation')
  })

  it('refuses a week outside 1..12 rather than returning a phase for it', () => {
    expect(() => phaseForWeek(0)).toThrow()
    expect(() => phaseForWeek(13)).toThrow()
    expect(() => phaseForWeek(1.5)).toThrow()
  })

  it('agrees between PHASE_META week ranges and weeksForPhase', () => {
    for (const phase of ARC_PHASES) {
      const [first, last] = PHASE_META[phase].weeks
      const weeks = weeksForPhase(phase)
      expect(weeks[0]).toBe(first)
      expect(weeks[weeks.length - 1]).toBe(last)
    }
  })
})

describe('formats and pillars', () => {
  it('gives every format a label and description, and nothing else', () => {
    expect(Object.keys(FORMAT_META).sort()).toEqual([...SLOT_FORMATS].sort())
    for (const format of SLOT_FORMATS) {
      expect(FORMAT_META[format].label.length).toBeGreaterThan(0)
      expect(FORMAT_META[format].description.length).toBeGreaterThan(0)
    }
  })

  it('asks for 4-5 pillars (spec §4.2)', () => {
    expect(MIN_PILLARS).toBe(4)
    expect(MAX_PILLARS).toBe(5)
  })
})
