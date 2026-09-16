import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SlotBrief, StrategyDraft } from './strategies'

/**
 * The strategy repository is the authorization boundary for three tables
 * (Prisma bypasses RLS), so what these tests pin down is scoping: every read
 * filters on `user_id`, every write carries it, and a write that names a row
 * id still cannot touch a row the user does not own. Mocks `../client` the
 * same way `voice-profiles.test.ts` does — there is no database in this
 * test environment.
 */

const strategies = {
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  upsert: vi.fn(),
}
const pillars = { deleteMany: vi.fn(), create: vi.fn() }
const slots = { deleteMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() }

const tx = { strategies, pillars, slots }
const $transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))

const getPrisma = vi.fn(() => ({ ...tx, $transaction }))
vi.mock('../client', () => ({ getPrisma }))

const { getNextSlot, getStrategy, replaceStrategy, saveSlotBriefs } = await import('./strategies')

const USER = 'user-1'
const OTHER_USER = 'user-2'

function draft(): StrategyDraft {
  return {
    cadencePerWeek: 3,
    startsOn: '2026-09-21',
    positioning: 'The only ops coach who...',
    phases: {
      authority: 'a',
      'problem-aware': 'b',
      'offer-aware': 'c',
      invitation: 'd',
    },
    weekThemes: Array.from({ length: 12 }, (_, i) => `theme ${i + 1}`),
    pillars: [
      { position: 1, name: 'Systems', description: 'How ops actually work.' },
      { position: 2, name: 'Hiring', description: 'Who to hire when.' },
      { position: 3, name: 'Founder time', description: 'Where the hours go.' },
      { position: 4, name: 'Proof', description: 'What changed for clients.' },
    ],
    slots: [
      {
        pillarPosition: 2,
        weekIndex: 1,
        position: 1,
        scheduledOn: '2026-09-21',
        theme: 'First hire',
        angle: 'Hire an operator before a salesperson.',
        format: 'contrarian',
        brief: 'Argue the order most founders get wrong.',
      },
    ],
  }
}

function strategyRow() {
  return {
    id: 'strategy-1',
    user_id: USER,
    version: 2,
    cadence_per_week: 3,
    starts_on: new Date('2026-09-21T00:00:00Z'),
    positioning: 'The only ops coach who...',
    phase_authority: 'a',
    phase_problem_aware: 'b',
    phase_offer_aware: 'c',
    phase_invitation: 'd',
    week_themes: Array.from({ length: 12 }, (_, i) => `theme ${i + 1}`),
    generated_at: new Date('2026-09-16T10:00:00Z'),
    created_at: new Date('2026-09-16T10:00:00Z'),
    updated_at: new Date('2026-09-16T10:00:00Z'),
    pillars: [
      { id: 'p1', position: 1, name: 'Systems', description: 'How ops actually work.' },
      { id: 'p2', position: 2, name: 'Hiring', description: 'Who to hire when.' },
    ],
    slots: [
      {
        id: 's1',
        pillar_id: 'p2',
        week_index: 1,
        position: 1,
        scheduled_on: new Date('2026-09-21T00:00:00Z'),
        theme: 'First hire',
        angle: 'Hire an operator before a salesperson.',
        format: 'contrarian',
        brief: 'Argue the order most founders get wrong.',
        hook: null,
        key_points: [],
        proof_point: null,
        cta: null,
        status: 'planned',
      },
    ],
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('getStrategy', () => {
  it('scopes the read on user_id and maps dates to plain ISO dates', async () => {
    strategies.findUnique.mockResolvedValue(strategyRow())

    const result = await getStrategy(USER)

    expect(strategies.findUnique).toHaveBeenCalledTimes(1)
    const call = strategies.findUnique.mock.calls[0]?.[0] as { where: { user_id: string } }
    expect(call.where).toEqual({ user_id: USER })
    expect(result?.startsOn).toBe('2026-09-21')
    expect(result?.slots[0]?.scheduledOn).toBe('2026-09-21')
    expect(result?.phases['problem-aware']).toBe('b')
    expect(result?.slots[0]?.pillarId).toBe('p2')
  })

  it('returns null when the user has no strategy', async () => {
    strategies.findUnique.mockResolvedValue(null)
    await expect(getStrategy(USER)).resolves.toBeNull()
  })
})

describe('replaceStrategy', () => {
  function primeTransaction() {
    strategies.findUnique.mockResolvedValue({ id: 'strategy-1', version: 1 })
    strategies.upsert.mockResolvedValue({ id: 'strategy-1', version: 2 })
    pillars.create.mockImplementation(async ({ data }: { data: { position: number } }) => ({
      id: `pillar-${data.position}`,
    }))
    slots.createMany.mockResolvedValue({ count: 1 })
    strategies.findUniqueOrThrow.mockResolvedValue(strategyRow())
  }

  it('runs inside one transaction', async () => {
    primeTransaction()
    await replaceStrategy(USER, draft())
    expect($transaction).toHaveBeenCalledTimes(1)
  })

  it('deletes the old pillars and slots scoped on user_id, never unscoped', async () => {
    primeTransaction()
    await replaceStrategy(USER, draft())

    expect(slots.deleteMany).toHaveBeenCalledWith({ where: { user_id: USER } })
    expect(pillars.deleteMany).toHaveBeenCalledWith({ where: { user_id: USER } })
  })

  it('increments the version atomically on a regenerate and starts at 1 for a first strategy', async () => {
    primeTransaction()
    await replaceStrategy(USER, draft())
    const upsert = strategies.upsert.mock.calls[0]?.[0] as {
      where: { user_id: string }
      create: { version: number; user_id: string }
      update: { version: { increment: number } }
    }
    expect(upsert.where).toEqual({ user_id: USER })
    expect(upsert.create.version).toBe(1)
    expect(upsert.create.user_id).toBe(USER)
    // An increment expression, never a number computed from a prior read:
    // two tabs regenerating at once must not both write the same version.
    expect(upsert.update.version).toEqual({ increment: 1 })
    expect(strategies.findUnique).not.toHaveBeenCalled()
  })

  it('writes user_id onto every pillar and every slot, and resolves pillar positions to ids', async () => {
    primeTransaction()
    await replaceStrategy(USER, draft())

    expect(pillars.create).toHaveBeenCalledTimes(4)
    for (const call of pillars.create.mock.calls) {
      const { data } = call[0] as { data: { user_id: string; strategy_id: string } }
      expect(data.user_id).toBe(USER)
      expect(data.strategy_id).toBe('strategy-1')
    }

    const created = slots.createMany.mock.calls[0]?.[0] as {
      data: { user_id: string; pillar_id: string; scheduled_on: Date; format: string }[]
    }
    expect(created.data).toHaveLength(1)
    expect(created.data[0]?.user_id).toBe(USER)
    expect(created.data[0]?.pillar_id).toBe('pillar-2')
    expect(created.data[0]?.scheduled_on.toISOString()).toBe('2026-09-21T00:00:00.000Z')
  })

  it('refuses a slot whose pillar position does not exist rather than inserting a dangling row', async () => {
    primeTransaction()
    const bad = draft()
    bad.slots = [{ ...draft().slots[0]!, pillarPosition: 9 }]

    await expect(replaceStrategy(USER, bad)).rejects.toThrow(/pillar/i)
    expect(slots.createMany).not.toHaveBeenCalled()
  })
})

describe('saveSlotBriefs', () => {
  const briefs: SlotBrief[] = [
    { slotId: 's1', hook: 'H', keyPoints: ['a', 'b'], proofPoint: 'P', cta: 'C' },
    { slotId: 's2', hook: 'H2', keyPoints: [], proofPoint: null, cta: 'C2' },
  ]

  it('updates each slot by id AND user_id, marking it briefed', async () => {
    slots.updateMany.mockResolvedValue({ count: 1 })

    const count = await saveSlotBriefs(USER, briefs)

    expect(count).toBe(2)
    expect(slots.updateMany).toHaveBeenCalledTimes(2)
    for (const call of slots.updateMany.mock.calls) {
      const { where, data } = call[0] as {
        where: { id: string; user_id: string }
        data: { status: string }
      }
      expect(where.user_id).toBe(USER)
      expect(typeof where.id).toBe('string')
      expect(data.status).toBe('briefed')
    }
  })

  it("reports zero when the slot ids belong to someone else -- the scope did its job", async () => {
    // Prisma's updateMany returns count 0 when the compound where matches
    // nothing; the repository must surface that rather than claim success.
    slots.updateMany.mockResolvedValue({ count: 0 })
    await expect(saveSlotBriefs(OTHER_USER, briefs)).resolves.toBe(0)
  })

  it('is a no-op for an empty list', async () => {
    await expect(saveSlotBriefs(USER, [])).resolves.toBe(0)
    expect(slots.updateMany).not.toHaveBeenCalled()
  })
})

describe('getNextSlot', () => {
  it('finds the earliest slot on or after the date, for this user only', async () => {
    slots.findFirst.mockResolvedValue({
      ...strategyRow().slots[0],
      pillars: { name: 'Hiring' },
    })

    const slot = await getNextSlot(USER, '2026-09-16')

    const call = slots.findFirst.mock.calls[0]?.[0] as {
      where: { user_id: string; scheduled_on: { gte: Date } }
      orderBy: { scheduled_on: string }
    }
    expect(call.where.user_id).toBe(USER)
    expect(call.where.scheduled_on.gte.toISOString()).toBe('2026-09-16T00:00:00.000Z')
    expect(call.orderBy).toEqual({ scheduled_on: 'asc' })
    expect(slot?.pillarName).toBe('Hiring')
    expect(slot?.scheduledOn).toBe('2026-09-21')
  })

  it('returns null when nothing is scheduled from that date on', async () => {
    slots.findFirst.mockResolvedValue(null)
    await expect(getNextSlot(USER, '2027-01-01')).resolves.toBeNull()
  })
})
