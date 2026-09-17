import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewPost } from './posts'

/**
 * The posts repository is the authorization boundary for two tables (Prisma
 * bypasses RLS), so what these tests pin down is scoping: every read filters on
 * `user_id`, every write carries it, and a write that names a row id still
 * cannot touch a row the user does not own. Mocks `../client` the same way
 * `strategies.test.ts` does — there is no database in this test environment.
 *
 * They also pin the two behaviours the state machine depends on and which no
 * type can enforce: saving text reverts an approved post to `draft`
 * (Ruling R-M5-6), and the preference signals are recomputed on that same
 * write rather than trusted from the caller.
 */

const posts = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
}
const post_variants = {
  findMany: vi.fn(),
  createMany: vi.fn(),
  deleteMany: vi.fn(),
}

const tx = { posts, post_variants }
const $transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
const getPrisma = vi.fn(() => ({ ...tx, $transaction }))
vi.mock('../client', () => ({ getPrisma }))

const {
  createPostWithBrief,
  deletePost,
  getPostBySlot,
  getPostById,
  listPosts,
  countPosts,
  replaceVariants,
  saveFinalText,
  savePolish,
  resolvePolish,
  selectVariant,
  setApproved,
} = await import('./posts')

const USER = 'user-1'
const OTHER_USER = 'user-2'
const POST = 'post-1'

function newPost(): NewPost {
  return {
    slotId: 'slot-1',
    slotTheme: 'Hiring senior talent',
    slotFormat: 'contrarian',
    slotScheduledOn: '2026-09-21',
    briefAngle: 'Most founders hire the wrong role first.',
    briefHook: 'Open on the cost of the wrong first hire.',
    briefKeyPoints: ['Name the symptom', 'Name the cause'],
    briefProof: 'The 23 agencies figure.',
    briefCta: 'Ask them what their first hire was.',
  }
}

/** A stored row, shaped as Prisma returns it. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: POST,
    user_id: USER,
    slot_id: 'slot-1',
    slot_theme: 'Hiring senior talent',
    slot_format: 'contrarian',
    slot_scheduled_on: new Date('2026-09-21T00:00:00Z'),
    brief_angle: 'a',
    brief_hook: 'h',
    brief_key_points: ['one'],
    brief_proof: null,
    brief_cta: 'c',
    variant_index: null,
    final_text: null,
    polished_text: null,
    status: 'draft',
    approved_at: null,
    borrowed_from_variants: [],
    borrowed_char_count: 0,
    edit_ratio: null,
    polish_outcome: null,
    linkedin_urn: null,
    created_at: new Date(),
    updated_at: new Date(),
    post_variants: [],
    ...over,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('every query is scoped by userId', () => {
  it('getPostBySlot filters on user_id and slot_id', async () => {
    posts.findFirst.mockResolvedValue(null)
    await getPostBySlot(USER, 'slot-1')
    expect(posts.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      user_id: USER,
      slot_id: 'slot-1',
    })
  })

  it('getPostById filters on user_id as well as id', async () => {
    posts.findFirst.mockResolvedValue(null)
    await getPostById(USER, POST)
    expect(posts.findFirst.mock.calls[0]?.[0].where).toMatchObject({ id: POST, user_id: USER })
  })

  it('listPosts filters on user_id', async () => {
    posts.findMany.mockResolvedValue([])
    await listPosts(USER)
    expect(posts.findMany.mock.calls[0]?.[0].where).toMatchObject({ user_id: USER })
  })

  it('countPosts filters on user_id', async () => {
    posts.count.mockResolvedValue(0)
    await countPosts(USER)
    expect(posts.count.mock.calls[0]?.[0].where).toMatchObject({ user_id: USER })
  })

  it('createPostWithBrief writes the user_id it was given', async () => {
    posts.create.mockResolvedValue(row())
    await createPostWithBrief(USER, newPost())
    expect(posts.create.mock.calls[0]?.[0].data).toMatchObject({ user_id: USER })
  })

  it('deletePost scopes on BOTH id and user_id', async () => {
    posts.deleteMany.mockResolvedValue({ count: 1 })
    await deletePost(USER, POST)
    expect(posts.deleteMany.mock.calls[0]?.[0].where).toMatchObject({
      id: POST,
      user_id: USER,
    })
  })

  it('selectVariant scopes on BOTH id and user_id', async () => {
    posts.updateMany.mockResolvedValue({ count: 1 })
    posts.findFirst.mockResolvedValue(row())
    await selectVariant(USER, POST, 1, 'chosen text')
    expect(posts.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      id: POST,
      user_id: USER,
    })
  })

  it('setApproved scopes on BOTH id and user_id', async () => {
    posts.updateMany.mockResolvedValue({ count: 1 })
    posts.findFirst.mockResolvedValue(row({ final_text: 'ready', status: 'draft' }))
    await setApproved(USER, POST, true)
    expect(posts.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      id: POST,
      user_id: USER,
    })
  })

  // An insert has no WHERE, so the ownership claim has to be earned before it.
  // Both current callers happen to check first, but "the callers are careful"
  // is not an authorization model -- a third one would write variants into
  // another user's post, and they would render in that user's editor.
  it('replaceVariants writes nothing when the post is not the user’s', async () => {
    posts.count.mockResolvedValue(0)
    posts.findFirst.mockResolvedValue(null)
    await replaceVariants(OTHER_USER, POST, [
      { variantIndex: 0, approach: 'hook-forward', content: 'a' },
    ])
    expect(post_variants.createMany).not.toHaveBeenCalled()
    expect(posts.count.mock.calls[0]?.[0].where).toMatchObject({
      id: POST,
      user_id: OTHER_USER,
    })
  })

  it('selectVariant clears the previous draft’s polish verdict', async () => {
    posts.updateMany.mockResolvedValue({ count: 1 })
    posts.findFirst.mockResolvedValue(row())
    await selectVariant(USER, POST, 1, 'chosen text')
    expect(posts.updateMany.mock.calls[0]?.[0].data.polish_outcome).toBeNull()
  })

  it('replaceVariants scopes the delete and the insert on user_id', async () => {
    posts.count.mockResolvedValue(1)
    posts.findFirst.mockResolvedValue(row())
    post_variants.deleteMany.mockResolvedValue({ count: 3 })
    post_variants.createMany.mockResolvedValue({ count: 3 })
    await replaceVariants(USER, POST, [
      { variantIndex: 0, approach: 'hook-forward', content: 'a' },
      { variantIndex: 1, approach: 'story-forward', content: 'b' },
      { variantIndex: 2, approach: 'proof-forward', content: 'c' },
    ])
    expect(post_variants.deleteMany.mock.calls[0]?.[0].where).toMatchObject({
      post_id: POST,
      user_id: USER,
    })
    for (const created of post_variants.createMany.mock.calls[0]?.[0].data ?? []) {
      expect(created.user_id).toBe(USER)
    }
  })

  // The shape a cross-customer leak would take: the caller passes someone
  // else's post id and the row id alone is enough to reach it. It is not --
  // setApproved loads the post scoped by user first, so an unowned post never
  // reaches the write at all. Asserting that no write was attempted is a
  // stronger guarantee than asserting the write was scoped.
  it('never attempts a write when the post belongs to another user', async () => {
    posts.findFirst.mockResolvedValue(null)
    const result = await setApproved(OTHER_USER, POST, true)
    expect(result).toBeNull()
    expect(posts.updateMany).not.toHaveBeenCalled()
    expect(posts.findFirst.mock.calls[0]?.[0].where).toMatchObject({ user_id: OTHER_USER })
  })
})

describe('saveFinalText', () => {
  it('recomputes the preference signals from the stored variants', async () => {
    const borrowed = 'x'.repeat(60)
    posts.findFirst.mockResolvedValue(
      row({
        variant_index: 0,
        post_variants: [
          { variant_index: 0, approach: 'hook-forward', content: 'chosen original' },
          { variant_index: 1, approach: 'story-forward', content: `lead ${borrowed} tail` },
          { variant_index: 2, approach: 'proof-forward', content: 'unrelated' },
        ],
      }),
    )
    posts.updateMany.mockResolvedValue({ count: 1 })

    await saveFinalText(USER, POST, `kept ${borrowed} more`)

    const data = posts.updateMany.mock.calls[0]?.[0].data
    expect(data.borrowed_from_variants).toEqual([1])
    expect(data.borrowed_char_count).toBeGreaterThanOrEqual(60)
    expect(data.edit_ratio).toBeGreaterThan(0)
  })

  it('compares only against the variants the user did NOT choose', async () => {
    const shared = 'y'.repeat(60)
    posts.findFirst.mockResolvedValue(
      row({
        variant_index: 0,
        post_variants: [
          { variant_index: 0, approach: 'hook-forward', content: `chosen ${shared}` },
          { variant_index: 1, approach: 'story-forward', content: 'nothing alike' },
          { variant_index: 2, approach: 'proof-forward', content: 'nothing alike either' },
        ],
      }),
    )
    posts.updateMany.mockResolvedValue({ count: 1 })

    await saveFinalText(USER, POST, `chosen ${shared}`)

    // Keeping the chosen variant's own words is not borrowing.
    expect(posts.updateMany.mock.calls[0]?.[0].data.borrowed_from_variants).toEqual([])
  })

  // Ruling R-M5-6. Without this, a user edits an approved post and Milestone 6
  // still believes the text was reviewed.
  it('reverts an approved post to draft', async () => {
    posts.findFirst.mockResolvedValue(row({ status: 'approved', variant_index: 0 }))
    posts.updateMany.mockResolvedValue({ count: 1 })

    await saveFinalText(USER, POST, 'edited after approval')

    const data = posts.updateMany.mock.calls[0]?.[0].data
    expect(data.status).toBe('draft')
    expect(data.approved_at).toBeNull()
  })

  // Two tabs: one polishes, the other saves an edit. Without this the stale
  // polish survives, the editor hides the textarea behind the compare pane,
  // and accepting overwrites the edit that was just saved. There is no undo.
  it('clears a pending polish, because it was computed against the old text', async () => {
    posts.findFirst.mockResolvedValue(
      row({ variant_index: 0, polished_text: 'a polish of text that no longer exists' }),
    )
    posts.updateMany.mockResolvedValue({ count: 1 })
    await saveFinalText(USER, POST, 'newly edited text')
    expect(posts.updateMany.mock.calls[0]?.[0].data.polished_text).toBeNull()
  })

  it('leaves a draft as a draft', async () => {
    posts.findFirst.mockResolvedValue(row({ status: 'draft', variant_index: 0 }))
    posts.updateMany.mockResolvedValue({ count: 1 })
    await saveFinalText(USER, POST, 'still a draft')
    expect(posts.updateMany.mock.calls[0]?.[0].data.status).toBe('draft')
  })

  it('returns null rather than writing when the post is not the user’s', async () => {
    posts.findFirst.mockResolvedValue(null)
    const result = await saveFinalText(OTHER_USER, POST, 'text')
    expect(result).toBeNull()
    expect(posts.updateMany).not.toHaveBeenCalled()
  })
})

describe('polish', () => {
  // The defect this suite missed on the first pass. saveFinalText reverted an
  // approved post to draft; resolvePolish wrote final_text and left the status
  // alone. Mark ready -> Polish -> Use the polished version therefore produced
  // a post reading `approved` whose text nobody had reviewed -- the one state
  // Milestone 6 is told it can trust. The boundary was applied to one
  // text-writing path and not the other.
  it('accepting a polish un-approves the post, like any other text change', async () => {
    posts.findFirst.mockResolvedValue(
      row({
        variant_index: 0,
        status: 'approved',
        approved_at: new Date(),
        final_text: 'the reviewed text',
        polished_text: 'a rewrite nobody has read',
        post_variants: [
          { variant_index: 0, approach: 'hook-forward', content: 'the reviewed text' },
        ],
      }),
    )
    posts.updateMany.mockResolvedValue({ count: 1 })

    await resolvePolish(USER, POST, 'accepted')

    const data = posts.updateMany.mock.calls[0]?.[0].data
    expect(data.final_text).toBe('a rewrite nobody has read')
    expect(data.status).toBe('draft')
    expect(data.approved_at).toBeNull()
  })

  it('accepting a polish recomputes the preference signals against the new text', async () => {
    const borrowed = 'z'.repeat(60)
    posts.findFirst.mockResolvedValue(
      row({
        variant_index: 0,
        final_text: 'mine',
        polished_text: `polished ${borrowed} tail`,
        post_variants: [
          { variant_index: 0, approach: 'hook-forward', content: 'chosen original' },
          { variant_index: 1, approach: 'story-forward', content: `lead ${borrowed} end` },
          { variant_index: 2, approach: 'proof-forward', content: 'unrelated' },
        ],
      }),
    )
    posts.updateMany.mockResolvedValue({ count: 1 })

    await resolvePolish(USER, POST, 'accepted')

    const data = posts.updateMany.mock.calls[0]?.[0].data
    // Stale signals would describe the pre-polish text, and Milestone 9 would
    // be told this person barely edits writing they never wrote.
    expect(data.borrowed_from_variants).toEqual([1])
    expect(data.edit_ratio).toBeGreaterThan(0)
  })

  it('records no outcome when there is no pending polish to resolve', async () => {
    posts.findFirst.mockResolvedValue(row({ polished_text: null }))
    const result = await resolvePolish(USER, POST, 'accepted')
    expect(result).toBeNull()
    // Otherwise a crafted POST fabricates a Milestone 9 preference signal for
    // a polish that never happened.
    expect(posts.updateMany).not.toHaveBeenCalled()
  })

  it('savePolish stores the pending text without touching final_text', async () => {
    posts.updateMany.mockResolvedValue({ count: 1 })
    posts.findFirst.mockResolvedValue(row({ polished_text: 'polished' }))
    await savePolish(USER, POST, 'polished')
    const data = posts.updateMany.mock.calls[0]?.[0].data
    expect(data.polished_text).toBe('polished')
    expect(data).not.toHaveProperty('final_text')
  })

  it('accepting promotes the polish to final text and clears it', async () => {
    posts.findFirst.mockResolvedValue(row({ variant_index: 0, polished_text: 'polished text' }))
    posts.updateMany.mockResolvedValue({ count: 1 })
    await resolvePolish(USER, POST, 'accepted')
    const data = posts.updateMany.mock.calls[0]?.[0].data
    expect(data.final_text).toBe('polished text')
    expect(data.polished_text).toBeNull()
    expect(data.polish_outcome).toBe('accepted')
  })

  it('discarding clears the polish and leaves the text alone', async () => {
    posts.findFirst.mockResolvedValue(
      row({ variant_index: 0, final_text: 'mine', polished_text: 'theirs' }),
    )
    posts.updateMany.mockResolvedValue({ count: 1 })
    await resolvePolish(USER, POST, 'discarded')
    const data = posts.updateMany.mock.calls[0]?.[0].data
    expect(data.polished_text).toBeNull()
    expect(data.polish_outcome).toBe('discarded')
    expect(data.final_text).toBeUndefined()
  })
})

describe('setApproved', () => {
  it('refuses to approve a post with no text', async () => {
    posts.findFirst.mockResolvedValue(row({ final_text: null }))
    const result = await setApproved(USER, POST, true)
    expect(result).toBeNull()
    expect(posts.updateMany).not.toHaveBeenCalled()
  })

  it('stamps approved_at when approving', async () => {
    posts.findFirst.mockResolvedValue(row({ final_text: 'ready', status: 'draft' }))
    posts.updateMany.mockResolvedValue({ count: 1 })
    await setApproved(USER, POST, true)
    const data = posts.updateMany.mock.calls[0]?.[0].data
    expect(data.status).toBe('approved')
    expect(data.approved_at).toBeInstanceOf(Date)
  })

  it('clears approved_at when unapproving', async () => {
    posts.findFirst.mockResolvedValue(row({ final_text: 'ready', status: 'approved' }))
    posts.updateMany.mockResolvedValue({ count: 1 })
    await setApproved(USER, POST, false)
    const data = posts.updateMany.mock.calls[0]?.[0].data
    expect(data.status).toBe('draft')
    expect(data.approved_at).toBeNull()
  })
})
