import { describe, expect, it } from 'vitest'
import { LlmError } from '@/server/llm/client'
import { scheduleSlots } from '@/lib/strategy/schedule'
import { assembleSlots, type WeekOutput } from './assemble'

/**
 * `assembleSlots` is the seam between what the model said and what gets
 * written. The model is asked for exactly `cadence` slots per week and a
 * pillar number from 1..N; these tests pin down what happens when it does
 * not comply, and that the dates never come from the model at all.
 */

const START = '2026-09-21' // a Monday

function slot(pillar = 1, overrides: Partial<WeekOutput['slots'][number]> = {}) {
  return {
    pillar,
    theme: 'Theme',
    angle: 'Angle',
    format: 'story' as const,
    brief: 'Brief',
    ...overrides,
  }
}

function fullOutput(cadence: number, perWeek = cadence): WeekOutput[] {
  return Array.from({ length: 12 }, (_, i) => ({
    week_index: i + 1,
    slots: Array.from({ length: perWeek }, (_, j) => slot((j % 4) + 1, { theme: `W${i + 1}S${j + 1}` })),
  }))
}

describe('assembleSlots', () => {
  it('dates every slot from the schedule, in week/position order, never from the model', () => {
    const slots = assembleSlots(fullOutput(3), 4, 3, START)
    const expected = scheduleSlots(START, 3)

    expect(slots).toHaveLength(36)
    slots.forEach((s, i) => {
      expect(s.weekIndex).toBe(expected[i]?.weekIndex)
      expect(s.position).toBe(expected[i]?.position)
      expect(s.scheduledOn).toBe(expected[i]?.scheduledOn)
    })
    expect(slots[0]?.theme).toBe('W1S1')
    expect(slots[35]?.theme).toBe('W12S3')
  })

  it('accepts weeks in any order from the model', () => {
    const shuffled = [...fullOutput(3)].reverse()
    const slots = assembleSlots(shuffled, 4, 3, START)
    expect(slots[0]?.theme).toBe('W1S1')
    expect(slots[0]?.scheduledOn).toBe(START)
  })

  it('truncates a week the model over-filled to the cadence', () => {
    const slots = assembleSlots(fullOutput(3, 5), 4, 3, START)
    expect(slots).toHaveLength(36)
    expect(slots.filter((s) => s.weekIndex === 1)).toHaveLength(3)
  })

  it('throws an LlmError when a week is short -- there is nothing honest to fill it with', () => {
    const output = fullOutput(3)
    output[4] = { week_index: 5, slots: [slot(), slot()] }
    expect(() => assembleSlots(output, 4, 3, START)).toThrow(LlmError)
    expect(() => assembleSlots(output, 4, 3, START)).toThrow(/week 5/i)
  })

  it('throws an LlmError when a week is missing entirely', () => {
    const output = fullOutput(3).filter((w) => w.week_index !== 8)
    expect(() => assembleSlots(output, 4, 3, START)).toThrow(/week 8/i)
  })

  it('throws an LlmError for a pillar number outside 1..pillarCount', () => {
    const zero = fullOutput(3)
    zero[0] = { week_index: 1, slots: [slot(0), slot(1), slot(1)] }
    expect(() => assembleSlots(zero, 4, 3, START)).toThrow(/pillar/i)

    const high = fullOutput(3)
    high[0] = { week_index: 1, slots: [slot(5), slot(1), slot(1)] }
    expect(() => assembleSlots(high, 4, 3, START)).toThrow(/pillar/i)
  })

  it('carries the pillar as a 1-based position for the repository to resolve', () => {
    const output = fullOutput(3)
    output[0] = { week_index: 1, slots: [slot(4), slot(2), slot(1)] }
    const slots = assembleSlots(output, 4, 3, START)
    expect(slots.slice(0, 3).map((s) => s.pillarPosition)).toEqual([4, 2, 1])
  })

  it('trims text fields and rejects a blank theme -- the database would anyway', () => {
    const output = fullOutput(3)
    output[0] = {
      week_index: 1,
      slots: [slot(1, { theme: '  Padded  ', angle: ' A ', brief: ' B ' }), slot(1), slot(1)],
    }
    const slots = assembleSlots(output, 4, 3, START)
    expect(slots[0]).toMatchObject({ theme: 'Padded', angle: 'A', brief: 'B' })

    const blank = fullOutput(3)
    blank[0] = { week_index: 1, slots: [slot(1, { theme: '   ' }), slot(1), slot(1)] }
    expect(() => assembleSlots(blank, 4, 3, START)).toThrow(/theme/i)
  })

  it('works at every cadence', () => {
    expect(assembleSlots(fullOutput(4), 5, 4, START)).toHaveLength(48)
    expect(assembleSlots(fullOutput(5), 5, 5, START)).toHaveLength(60)
  })
})
