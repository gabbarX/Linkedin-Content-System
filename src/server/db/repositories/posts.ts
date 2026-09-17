import 'server-only'
import type { IsoDate } from '@/lib/strategy/schedule'
import type { SlotFormat } from '@/lib/strategy/vocabulary'
import { borrowedSpans, editRatio } from '@/lib/post/signals'
import {
  type PolishOutcome,
  type PostStatus,
  type VariantApproach,
} from '@/lib/post/vocabulary'
import { countCharacters } from '@/lib/post/measure'
import { getPrisma } from '../client'

/**
 * Post data access (spec §4.4, §5).
 *
 * Prisma bypasses row-level security. **Every exported function takes userId
 * first and scopes on it.** That is the authorization model. Functions that
 * name a row id scope on the id AND the user, never the id alone — filtering
 * on a uuid alone would let any signed-in user reach any other user's post by
 * guessing one, and RLS is not there to catch it on the Prisma path.
 *
 * Two rules live here rather than in a caller, because a caller can forget and
 * the consequences are silent:
 *
 *   * **Saving text reverts an approved post to `draft`** (Ruling R-M5-6).
 *     `approved` means "this exact text was reviewed"; if an edit left the
 *     status alone, Milestone 6 would publish text nobody approved.
 *   * **The preference signals are recomputed on every text save**, from the
 *     stored variants, never taken from the caller. They are Milestone 9's
 *     input and a client could otherwise send anything.
 */

export type PostVariant = {
  variantIndex: number
  approach: VariantApproach
  content: string
  charCount: number
}

export type Post = {
  id: string
  userId: string
  /** Null once the strategy was regenerated and this post was detached. */
  slotId: string | null
  /** Snapshot of the slot at creation, so a detached post is still readable. */
  slotTheme: string
  slotFormat: SlotFormat
  slotScheduledOn: IsoDate | null
  briefAngle: string
  briefHook: string
  briefKeyPoints: string[]
  briefProof: string | null
  briefCta: string
  variantIndex: number | null
  finalText: string | null
  /** A polish awaiting accept or discard. */
  polishedText: string | null
  status: PostStatus
  approvedAt: Date | null
  borrowedFromVariants: number[]
  borrowedCharCount: number
  editRatio: number | null
  polishOutcome: PolishOutcome | null
  linkedinUrn: string | null
  createdAt: Date
  updatedAt: Date
  /** Ordered by variant index. */
  variants: PostVariant[]
}

/** Everything the brief stage produces, before any variant exists. */
export type NewPost = {
  slotId: string
  slotTheme: string
  slotFormat: SlotFormat
  slotScheduledOn: IsoDate | null
  briefAngle: string
  briefHook: string
  briefKeyPoints: string[]
  briefProof: string | null
  briefCta: string
}

export type NewVariant = {
  variantIndex: number
  approach: VariantApproach
  content: string
}

/**
 * numeric(4,3) arrives as a Prisma Decimal, which is not a number and does not
 * survive serialisation into a client component. Converted once, here — the
 * same boundary `voice-profiles.ts` documents.
 */
type DecimalLike = { toNumber(): number } | null

type VariantRow = {
  variant_index: number
  approach: string
  content: string
  char_count?: number
}

type PostRow = {
  id: string
  user_id: string
  slot_id: string | null
  slot_theme: string
  slot_format: string
  slot_scheduled_on: Date | null
  brief_angle: string
  brief_hook: string
  brief_key_points: string[]
  brief_proof: string | null
  brief_cta: string
  variant_index: number | null
  final_text: string | null
  polished_text: string | null
  status: string
  approved_at: Date | null
  borrowed_from_variants: number[]
  borrowed_char_count: number
  edit_ratio: DecimalLike
  polish_outcome: string | null
  linkedin_urn: string | null
  created_at: Date
  updated_at: Date
  post_variants?: VariantRow[]
}

const POST_INCLUDE = {
  post_variants: { orderBy: { variant_index: 'asc' as const } },
}

function toIsoDate(date: Date | null): IsoDate | null {
  return date === null ? null : date.toISOString().slice(0, 10)
}

function fromIsoDate(date: IsoDate | null): Date | null {
  return date === null ? null : new Date(`${date}T00:00:00Z`)
}

function toNumber(value: DecimalLike): number | null {
  return value === null || value === undefined ? null : value.toNumber()
}

function toVariant(row: VariantRow): PostVariant {
  return {
    variantIndex: row.variant_index,
    approach: row.approach as VariantApproach,
    content: row.content,
    charCount: row.char_count ?? countCharacters(row.content),
  }
}

function toPost(row: PostRow): Post {
  return {
    id: row.id,
    userId: row.user_id,
    slotId: row.slot_id,
    slotTheme: row.slot_theme,
    slotFormat: row.slot_format as SlotFormat,
    slotScheduledOn: toIsoDate(row.slot_scheduled_on),
    briefAngle: row.brief_angle,
    briefHook: row.brief_hook,
    briefKeyPoints: row.brief_key_points,
    briefProof: row.brief_proof,
    briefCta: row.brief_cta,
    variantIndex: row.variant_index,
    finalText: row.final_text,
    polishedText: row.polished_text,
    status: row.status as PostStatus,
    approvedAt: row.approved_at,
    borrowedFromVariants: row.borrowed_from_variants,
    borrowedCharCount: row.borrowed_char_count,
    editRatio: toNumber(row.edit_ratio),
    polishOutcome: row.polish_outcome as PolishOutcome | null,
    linkedinUrn: row.linkedin_urn,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    variants: (row.post_variants ?? []).map(toVariant),
  }
}

export async function getPostBySlot(userId: string, slotId: string): Promise<Post | null> {
  const row = await getPrisma().posts.findFirst({
    where: { user_id: userId, slot_id: slotId },
    include: POST_INCLUDE,
  })
  return row ? toPost(row) : null
}

export async function getPostById(userId: string, postId: string): Promise<Post | null> {
  const row = await getPrisma().posts.findFirst({
    where: { id: postId, user_id: userId },
    include: POST_INCLUDE,
  })
  return row ? toPost(row) : null
}

/**
 * Every post the user has, newest first. Attached and detached together —
 * `/posts` groups them, because a detached draft is still the user's writing
 * and hiding it would make "we kept your words" a false promise (R-M5-4).
 */
export async function listPosts(userId: string): Promise<Post[]> {
  const rows = await getPrisma().posts.findMany({
    where: { user_id: userId },
    include: POST_INCLUDE,
    orderBy: [{ created_at: 'desc' }],
  })
  return rows.map(toPost)
}

/** How many posts exist, for the Regenerate dialog's "N drafts will detach". */
export async function countPosts(userId: string): Promise<number> {
  return getPrisma().posts.count({ where: { user_id: userId } })
}

/**
 * Write the brief. Called the moment the brief's model call returns, BEFORE
 * the three variant calls run (Ruling R-M5-9), so a variant failure does not
 * throw away a call that was already billed.
 */
export async function createPostWithBrief(userId: string, post: NewPost): Promise<Post> {
  const row = await getPrisma().posts.create({
    data: {
      user_id: userId,
      slot_id: post.slotId,
      slot_theme: post.slotTheme,
      slot_format: post.slotFormat,
      slot_scheduled_on: fromIsoDate(post.slotScheduledOn),
      brief_angle: post.briefAngle,
      brief_hook: post.briefHook,
      brief_key_points: post.briefKeyPoints,
      brief_proof: post.briefProof,
      brief_cta: post.briefCta,
    },
    include: POST_INCLUDE,
  })
  return toPost(row)
}

/**
 * Replace the post's variants in one transaction.
 *
 * Used both for the first generation and for "write three more" (R-M5-3).
 * Deliberately does not touch `final_text`: a user who has already edited
 * keeps their words, and the confirm dialog in front of this says so.
 */
export async function replaceVariants(
  userId: string,
  postId: string,
  variants: NewVariant[],
): Promise<Post | null> {
  await getPrisma().$transaction(async (tx) => {
    await tx.post_variants.deleteMany({ where: { post_id: postId, user_id: userId } })
    await tx.post_variants.createMany({
      data: variants.map((variant) => ({
        user_id: userId,
        post_id: postId,
        variant_index: variant.variantIndex,
        approach: variant.approach,
        content: variant.content,
        char_count: countCharacters(variant.content),
      })),
    })
  })
  return getPostById(userId, postId)
}

/** The user picked a variant; its text becomes the working draft. */
export async function selectVariant(
  userId: string,
  postId: string,
  variantIndex: number,
  text: string,
): Promise<Post | null> {
  const updated = await getPrisma().posts.updateMany({
    where: { id: postId, user_id: userId },
    data: {
      variant_index: variantIndex,
      final_text: text,
      status: 'draft',
      approved_at: null,
      polished_text: null,
      borrowed_from_variants: [],
      borrowed_char_count: 0,
      edit_ratio: 0,
    },
  })
  if (updated.count === 0) return null
  return getPostById(userId, postId)
}

/**
 * Save edited text, recompute the preference signals, and revert approval.
 *
 * The signals are computed here from the stored variants rather than accepted
 * from the caller: they are Milestone 9's input, and a server action is a
 * public HTTP endpoint. Borrowing is measured against the variants the user did
 * **not** choose — keeping the chosen variant's own words is not borrowing.
 */
export async function saveFinalText(
  userId: string,
  postId: string,
  text: string,
): Promise<Post | null> {
  const existing = await getPostById(userId, postId)
  if (!existing) return null

  const chosen = existing.variants.find(
    (variant) => variant.variantIndex === existing.variantIndex,
  )
  const others = existing.variants.filter(
    (variant) => variant.variantIndex !== existing.variantIndex,
  )

  const borrowed = borrowedSpans(text, others)
  const ratio = chosen ? editRatio(chosen.content, text) : null

  const updated = await getPrisma().posts.updateMany({
    where: { id: postId, user_id: userId },
    data: {
      final_text: text,
      borrowed_from_variants: borrowed.fromVariants,
      borrowed_char_count: borrowed.charCount,
      edit_ratio: ratio,
      // Ruling R-M5-6: editing the text un-approves it. `approved` describes
      // the exact text that was reviewed, or it describes nothing.
      status: 'draft',
      approved_at: null,
    },
  })
  if (updated.count === 0) return null
  return getPostById(userId, postId)
}

/** Store a polish awaiting the user's accept or discard. */
export async function savePolish(
  userId: string,
  postId: string,
  polished: string,
): Promise<Post | null> {
  const updated = await getPrisma().posts.updateMany({
    where: { id: postId, user_id: userId },
    data: { polished_text: polished },
  })
  if (updated.count === 0) return null
  return getPostById(userId, postId)
}

/**
 * Accept or discard a pending polish. Accepting promotes it to the draft;
 * discarding leaves the user's own text untouched. Either way the pending text
 * is cleared and the outcome recorded, because which way the user went is
 * itself a preference signal.
 */
export async function resolvePolish(
  userId: string,
  postId: string,
  outcome: PolishOutcome,
): Promise<Post | null> {
  const existing = await getPostById(userId, postId)
  if (!existing) return null

  const promote =
    outcome === 'accepted' && existing.polishedText !== null
      ? { final_text: existing.polishedText }
      : {}

  const updated = await getPrisma().posts.updateMany({
    where: { id: postId, user_id: userId },
    data: {
      ...promote,
      polished_text: null,
      polish_outcome: outcome,
    },
  })
  if (updated.count === 0) return null
  return getPostById(userId, postId)
}

/**
 * Mark a post ready, or take that back (Ruling R-M5-6).
 *
 * **This is not authority to publish.** It records that the user finished
 * writing and reviewed the text; Milestone 6 still requires a tap at publish
 * time (docs/LINKEDIN-COMPLIANCE.md §3). Refuses to approve a post with no
 * text — the database check would reject it anyway, and a clear null beats a
 * 23514 surfacing three layers up.
 */
export async function setApproved(
  userId: string,
  postId: string,
  approved: boolean,
): Promise<Post | null> {
  const existing = await getPostById(userId, postId)
  if (!existing) return null
  if (approved && (existing.finalText === null || existing.finalText.trim().length === 0)) {
    return null
  }

  const updated = await getPrisma().posts.updateMany({
    where: { id: postId, user_id: userId },
    data: {
      status: approved ? 'approved' : 'draft',
      approved_at: approved ? new Date() : null,
    },
  })
  if (updated.count === 0) return null
  return getPostById(userId, postId)
}

/**
 * Scoped by BOTH id and userId, and that is not belt-and-braces: filtering on
 * id alone would let any signed-in user delete any other user's post by
 * guessing a uuid. Variants go with it by cascade.
 */
export async function deletePost(userId: string, postId: string): Promise<number> {
  const deleted = await getPrisma().posts.deleteMany({
    where: { id: postId, user_id: userId },
  })
  return deleted.count
}
