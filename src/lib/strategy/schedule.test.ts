import { describe, expect, it } from 'vitest'
import {
  addDays,
  firstMondayAfter,
  formatIsoDate,
  isoWeekday,
  scheduleSlots,
  todayInTimeZone,
  upcomingWeekIndex,
  weekdayOffsetsFor,
} from './schedule'

// 2026-09-14 is a Monday; 2026-09-20 a Sunday; 2026-09-21 the next Monday.

describe('todayInTimeZone', () => {
  // The whole point: "today" is the user's, not the server's. At 12:00 UTC on
  // the 16th, Kiritimati (UTC+14) is already on the 17th and Honolulu
  // (UTC-10) is still on the 16th. A Date-based implementation that reads
  // the server's local calendar would agree with neither on purpose.
  const now = new Date('2026-09-16T12:00:00Z')

  it('is the calendar date in the given zone, not the server zone', () => {
    expect(todayInTimeZone('Pacific/Kiritimati', now)).toBe('2026-09-17')
    expect(todayInTimeZone('Pacific/Honolulu', now)).toBe('2026-09-16')
    expect(todayInTimeZone('UTC', now)).toBe('2026-09-16')
  })

  it('crosses midnight correctly just before and after', () => {
    expect(todayInTimeZone('Europe/London', new Date('2026-09-16T23:30:00Z'))).toBe('2026-09-17')
    expect(todayInTimeZone('America/New_York', new Date('2026-09-17T03:30:00Z'))).toBe('2026-09-16')
  })

  it('falls back to UTC for an unknown zone rather than throwing', () => {
    expect(todayInTimeZone('Not/AZone', now)).toBe('2026-09-16')
  })
})

describe('date arithmetic', () => {
  it('adds days across a month boundary without touching local time', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('knows the ISO weekday (Mon = 1 ... Sun = 7)', () => {
    expect(isoWeekday('2026-09-14')).toBe(1)
    expect(isoWeekday('2026-09-20')).toBe(7)
  })

  it('finds the first Monday strictly after a date', () => {
    expect(firstMondayAfter('2026-09-14')).toBe('2026-09-21') // a Monday → next Monday, not itself
    expect(firstMondayAfter('2026-09-20')).toBe('2026-09-21') // a Sunday → tomorrow
    expect(firstMondayAfter('2026-09-16')).toBe('2026-09-21') // a Wednesday
  })
})

describe('weekdayOffsetsFor', () => {
  it('lays 3 posts on Mon/Wed/Fri, 4 on Mon/Tue/Thu/Fri, 5 on every weekday', () => {
    expect(weekdayOffsetsFor(3)).toEqual([0, 2, 4])
    expect(weekdayOffsetsFor(4)).toEqual([0, 1, 3, 4])
    expect(weekdayOffsetsFor(5)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('scheduleSlots', () => {
  it.each([3, 4, 5] as const)('yields 12 × %i dated slots, all distinct weekdays', (cadence) => {
    const slots = scheduleSlots('2026-09-21', cadence)
    expect(slots).toHaveLength(12 * cadence)
    expect(new Set(slots.map((s) => s.scheduledOn)).size).toBe(slots.length)
    for (const slot of slots) {
      const weekday = isoWeekday(slot.scheduledOn)
      expect(weekday).toBeGreaterThanOrEqual(1)
      expect(weekday).toBeLessThanOrEqual(5)
    }
  })

  it('starts week 1 on the start date and numbers weeks and positions from 1', () => {
    const slots = scheduleSlots('2026-09-21', 3)
    expect(slots[0]).toEqual({ weekIndex: 1, position: 1, scheduledOn: '2026-09-21' })
    expect(slots[1]).toEqual({ weekIndex: 1, position: 2, scheduledOn: '2026-09-23' })
    expect(slots[2]).toEqual({ weekIndex: 1, position: 3, scheduledOn: '2026-09-25' })
    expect(slots[3]).toEqual({ weekIndex: 2, position: 1, scheduledOn: '2026-09-28' })
    const last = slots[slots.length - 1]
    expect(last).toEqual({ weekIndex: 12, position: 3, scheduledOn: '2026-12-11' })
  })

  it('refuses a start date that is not a Monday — the arithmetic assumes it', () => {
    expect(() => scheduleSlots('2026-09-22', 3)).toThrow(/Monday/)
  })
})

describe('upcomingWeekIndex', () => {
  const startsOn = '2026-09-21'

  it('is week 1 before the plan starts and throughout week 1', () => {
    expect(upcomingWeekIndex(startsOn, '2026-09-16')).toBe(1)
    expect(upcomingWeekIndex(startsOn, '2026-09-21')).toBe(1)
    expect(upcomingWeekIndex(startsOn, '2026-09-27')).toBe(1) // the Sunday of week 1
  })

  it('advances on each Monday', () => {
    expect(upcomingWeekIndex(startsOn, '2026-09-28')).toBe(2)
    expect(upcomingWeekIndex(startsOn, '2026-12-07')).toBe(12)
  })

  it('is null once the plan is over', () => {
    expect(upcomingWeekIndex(startsOn, '2026-12-14')).toBeNull()
  })
})

describe('formatIsoDate', () => {
  it('formats deterministically in UTC, never shifting the day', () => {
    expect(formatIsoDate('2026-09-21')).toBe('21 Sep')
    expect(formatIsoDate('2026-09-21', { weekday: true })).toBe('Mon 21 Sep')
    expect(formatIsoDate('2026-09-21', { weekday: true, year: true })).toBe('Mon 21 Sep 2026')
  })
})
