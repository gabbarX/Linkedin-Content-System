import { WEEKS_IN_STRATEGY } from './vocabulary'

/**
 * Schedule arithmetic for the 12-week strategy (Ruling R-M3-2).
 *
 * Dates here are calendar dates, `'YYYY-MM-DD'`, never `Date` objects with a
 * time. Every function works in UTC on those strings so the server's own
 * timezone can never leak in: a `new Date('2026-09-21')` formatted with the
 * default locale on a server west of Greenwich prints the 20th, and that is
 * precisely the class of bug the reviewer checklist names ("timezone maths
 * done in the server's zone rather than the user's"). The only place a
 * timezone enters is `todayInTimeZone`, which asks Intl what day it is for
 * the user and returns a plain date string.
 *
 * Weeks are anchored on Mondays. The interview does not ask which days of
 * the week to post, so the days are fixed per cadence:
 *
 *   3 posts → Mon, Wed, Fri
 *   4 posts → Mon, Tue, Thu, Fri
 *   5 posts → Mon–Fri
 *
 * Recorded in docs/BACKLOG.md as a debt: the day pattern should become an
 * interview answer once there is evidence users want to choose it.
 */

/** A calendar date as `'YYYY-MM-DD'`. */
export type IsoDate = string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function toUtcMs(date: IsoDate): number {
  const match = ISO_DATE.exec(date)
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`)
  const [, year, month, day] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day))
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

const DAY_MS = 24 * 60 * 60 * 1000

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS)
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: IsoDate): number {
  const jsDay = new Date(toUtcMs(date)).getUTCDay() // Sunday = 0
  return jsDay === 0 ? 7 : jsDay
}

/**
 * The calendar date it currently is in `timeZone`. `en-CA` formats as
 * `YYYY-MM-DD` natively, which is the one locale trick this module relies
 * on. An unknown zone falls back to UTC rather than throwing: a bad zone
 * string in a profile should produce a plan a day off, not a crash on the
 * strategy page.
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }
  // en-CA yields e.g. "2026-09-16". Rebuilt from the parts anyway so a
  // locale-data change in the runtime cannot alter the shape.
  const parts = formatter.formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** The first Monday strictly after `date` — a Monday maps to the next one. */
export function firstMondayAfter(date: IsoDate): IsoDate {
  const weekday = isoWeekday(date)
  const daysUntilMonday = 8 - weekday // Mon(1) → 7, Sun(7) → 1
  return addDays(date, daysUntilMonday)
}

export type Cadence = 3 | 4 | 5

/** Offsets from Monday for each post in a week, ascending. */
export function weekdayOffsetsFor(cadence: Cadence): number[] {
  switch (cadence) {
    case 3:
      return [0, 2, 4]
    case 4:
      return [0, 1, 3, 4]
    case 5:
      return [0, 1, 2, 3, 4]
    default: {
      const exhaustive: never = cadence
      return exhaustive
    }
  }
}

export type ScheduledSlot = {
  weekIndex: number
  position: number
  scheduledOn: IsoDate
}

/**
 * Every dated slot of a 12-week plan starting on `startsOn` (a Monday) at
 * `cadence` posts per week, ordered by week then position. 12 × cadence
 * rows — 36, 48 or 60.
 */
export function scheduleSlots(startsOn: IsoDate, cadence: Cadence): ScheduledSlot[] {
  if (isoWeekday(startsOn) !== 1) {
    throw new RangeError(`A strategy must start on a Monday; ${startsOn} is not one.`)
  }
  const offsets = weekdayOffsetsFor(cadence)
  const slots: ScheduledSlot[] = []
  for (let week = 1; week <= WEEKS_IN_STRATEGY; week++) {
    const monday = addDays(startsOn, (week - 1) * 7)
    offsets.forEach((offset, index) => {
      slots.push({ weekIndex: week, position: index + 1, scheduledOn: addDays(monday, offset) })
    })
  }
  return slots
}

/**
 * The week the user should be looking at: the first week whose Sunday is
 * on or after `today`. Week 1 before the plan starts; null once the plan
 * has run its course.
 */
export function upcomingWeekIndex(startsOn: IsoDate, today: IsoDate): number | null {
  if (toUtcMs(today) < toUtcMs(startsOn)) return 1
  const daysIn = Math.floor((toUtcMs(today) - toUtcMs(startsOn)) / DAY_MS)
  const week = Math.floor(daysIn / 7) + 1
  return week <= WEEKS_IN_STRATEGY ? week : null
}

/** The Monday and Sunday of week `weekIndex`. */
export function weekBounds(startsOn: IsoDate, weekIndex: number): { from: IsoDate; to: IsoDate } {
  const from = addDays(startsOn, (weekIndex - 1) * 7)
  return { from, to: addDays(from, 6) }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * `'21 Sep'`, `'Mon 21 Sep'`, `'Mon 21 Sep 2026'`. Hand-built rather than
 * `toLocaleDateString` so the output is identical on the server and in the
 * browser (hydration) and never depends on a locale or a zone.
 */
export function formatIsoDate(
  date: IsoDate,
  options: { weekday?: boolean; year?: boolean } = {},
): string {
  const ms = toUtcMs(date)
  const d = new Date(ms)
  const parts: string[] = []
  if (options.weekday) parts.push(WEEKDAYS[isoWeekday(date) - 1] ?? '')
  parts.push(`${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''}`)
  if (options.year) parts.push(String(d.getUTCFullYear()))
  return parts.join(' ')
}
