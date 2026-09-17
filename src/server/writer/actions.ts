'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { PostActionResult } from '@/lib/post/action-result'
import { POLISH_OUTCOMES, VARIANT_APPROACHES, type PolishOutcome } from '@/lib/post/vocabulary'
import { routeForStep } from '@/lib/onboarding/steps'
import { createServerClient } from '@/lib/supabase/server'
import { requireEntitled } from '@/server/billing/entitlement'
import { getBusinessProfile, type BusinessProfile } from '@/server/db/repositories/business-profiles'
import {
  createPostWithBrief,
  deletePost,
  getPostById,
  getPostBySlot,
  replaceVariants,
  resolvePolish,
  saveFinalText,
  savePolish,
  selectVariant,
  setApproved,
  type Post,
} from '@/server/db/repositories/posts'
import { getStrategy, type Slot, type Strategy } from '@/server/db/repositories/strategies'
import { getVoiceProfile, type VoiceProfile } from '@/server/db/repositories/voice-profiles'
import { listWritingSamples } from '@/server/db/repositories/writing-samples'
import { createFallbackSession } from '@/server/llm/complete-with-fallback'
import { buildBrief, type Brief } from './build-brief'
import { describeWriterError } from './describe-writer-error'
import { generateVariants } from './generate-variants'
import { polish } from './polish'
import { selectExemplars } from './exemplars'

/**
 * The writer's server actions (spec §4.4).
 *
 * Every export re-derives the signed-in user from the session rather than
 * trusting anything the client sent — Prisma bypasses RLS, so a `userId`
 * argument would be a cross-customer data hole (CLAUDE.md). The only arguments
 * any of these take are row ids, and every one is validated as a string and
 * then used only inside a repository call that scopes on the user as well.
 *
 * **Every action calls `requireEntitled`.** A server action is a public HTTP
 * endpoint: the `(onboarded)` layout guard constrains a cooperative browser
 * and a crafted POST skips it entirely. What it would skip past here is four
 * model calls billed to us.
 *
 * **Order matters in `writePost`.** The brief call is made and *persisted*
 * before the three variant calls start (Ruling R-M5-9), so a variant failure
 * leaves a post row carrying a brief we already paid for, and "Try again"
 * costs three calls rather than four. `redirect()` stays outside every try,
 * because it works by throwing Next's navigation signal.
 */

/** `Error.message`/`.name` are non-enumerable, so logging the error object
 *  itself serialises to `{}` — same reasoning as the strategy actions. */
function describeErrorForLog(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function requireUserId(): Promise<string> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return user.id
}

/**
 * A server action's arguments arrive over HTTP and are `unknown` in practice
 * whatever the signature says. A non-empty string is the whole contract for a
 * row id; anything else is rejected before it reaches a query.
 */
function isRowId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Narrowed by comparison, never by a cast — `as` is not a loophole for `!`. */
function isVariantIndex(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    VARIANT_APPROACHES.some((_, index) => index === value)
  )
}

function isPolishOutcome(value: unknown): value is PolishOutcome {
  return POLISH_OUTCOMES.some((outcome) => outcome === value)
}

const INVALID_REQUEST = 'That request did not look right. Reload the page and try again.'
const NO_POST = 'That post no longer exists. Reload the page.'

type Inputs = {
  business: BusinessProfile
  voice: VoiceProfile
  strategy: Strategy
}

/**
 * The three records a post is written from. A user missing one is sent to the
 * onboarding step that produces it, exactly as the strategy actions do.
 */
async function loadInputs(userId: string): Promise<Inputs> {
  const [business, voice, strategy] = await Promise.all([
    getBusinessProfile(userId),
    getVoiceProfile(userId),
    getStrategy(userId),
  ])
  if (!business) redirect(routeForStep('interview'))
  if (!voice) redirect(routeForStep('samples'))
  if (!strategy) redirect('/strategy')
  return { business, voice, strategy }
}

/** The brief as it was stored, so a regeneration never re-bills the brief call. */
function briefFromPost(post: Post): Brief {
  return {
    angle: post.briefAngle,
    hook: post.briefHook,
    keyPoints: post.briefKeyPoints,
    proofPoint: post.briefProof,
    cta: post.briefCta,
  }
}

function pillarNameFor(strategy: Strategy, slot: Slot): string {
  return strategy.pillars.find((pillar) => pillar.id === slot.pillarId)?.name ?? 'their niche'
}

function revalidateWriterSurfaces(slotId: string | null): void {
  if (slotId !== null) revalidatePath(`/write/${slotId}`)
  revalidatePath('/posts')
  revalidatePath('/dashboard')
  revalidatePath('/strategy')
  revalidatePath('/calendar')
}

/**
 * Generate three drafts for a slot.
 *
 * Four model calls: one brief, then three variants in parallel. Triggered only
 * by an explicit tap (Ruling R-M5-3 / generation question) — opening a slot
 * generates nothing, so browsing the calendar can never bill us.
 */
export async function writePost(slotId: unknown): Promise<PostActionResult> {
  if (!isRowId(slotId)) return { ok: false, message: INVALID_REQUEST }

  const userId = await requireUserId()
  await requireEntitled(userId)
  const { business, voice, strategy } = await loadInputs(userId)

  // The slot is found inside the user's own strategy, so it is scoped by
  // construction — there is no way to name another user's slot here.
  const slot = strategy.slots.find((candidate) => candidate.id === slotId)
  if (!slot) return { ok: false, message: NO_POST }
  if (slot.status !== 'briefed') {
    return {
      ok: false,
      message: "This week isn't briefed yet. Write this week's briefs on your strategy first.",
    }
  }

  const existing = await getPostBySlot(userId, slot.id)
  if (existing && existing.variants.length > 0) {
    // Already written. Nothing to spend.
    return { ok: true }
  }

  const llm = createFallbackSession()
  const samples = await listWritingSamples(userId)

  let post = existing
  try {
    if (!post) {
      const brief = await buildBrief({
        strategy,
        slot,
        business,
        voice,
        pillarName: pillarNameFor(strategy, slot),
        llm,
      })
      // Durable before the variants run (Ruling R-M5-9). A variant failure
      // from here costs three calls to retry, not four.
      post = await createPostWithBrief(userId, {
        slotId: slot.id,
        slotTheme: slot.theme,
        slotFormat: slot.format,
        slotScheduledOn: slot.scheduledOn,
        briefAngle: brief.angle,
        briefHook: brief.hook,
        briefKeyPoints: brief.keyPoints,
        briefProof: brief.proofPoint,
        briefCta: brief.cta,
      })
    }

    const variants = await generateVariants({
      business,
      voice,
      exemplars: selectExemplars(samples, slot.format),
      brief: briefFromPost(post),
      format: slot.format,
      llm,
    })
    await replaceVariants(userId, post.id, variants)
  } catch (error) {
    console.error(
      `LinkBud: writePost failed for user ${userId} slot ${slot.id} - ${describeErrorForLog(error)}`,
    )
    return { ok: false, message: describeWriterError(error) }
  }

  revalidateWriterSurfaces(slot.id)
  return { ok: true }
}

/**
 * Replace the three drafts with three new ones.
 *
 * Reuses the stored brief rather than rebuilding it — three calls, not four.
 * Never touches `final_text`: a user who has already edited keeps their words,
 * and the confirm dialog in front of this says so.
 */
export async function regenerateVariants(postId: unknown): Promise<PostActionResult> {
  if (!isRowId(postId)) return { ok: false, message: INVALID_REQUEST }

  const userId = await requireUserId()
  await requireEntitled(userId)
  const { business, voice, strategy } = await loadInputs(userId)

  const post = await getPostById(userId, postId)
  if (!post) return { ok: false, message: NO_POST }

  const slot = post.slotId
    ? strategy.slots.find((candidate) => candidate.id === post.slotId)
    : undefined

  try {
    const samples = await listWritingSamples(userId)
    const variants = await generateVariants({
      business,
      voice,
      // A detached post has no slot to match a format against; its snapshot
      // still records what format it was written for.
      exemplars: selectExemplars(samples, slot?.format ?? post.slotFormat),
      brief: briefFromPost(post),
      format: slot?.format ?? post.slotFormat,
      llm: createFallbackSession(),
    })
    await replaceVariants(userId, post.id, variants)
  } catch (error) {
    console.error(
      `LinkBud: regenerateVariants failed for user ${userId} post ${post.id} - ${describeErrorForLog(error)}`,
    )
    return { ok: false, message: describeWriterError(error) }
  }

  revalidateWriterSurfaces(post.slotId)
  return { ok: true }
}

/** The user picked a variant; its text becomes the working draft. */
export async function chooseVariant(
  postId: unknown,
  variantIndex: unknown,
): Promise<PostActionResult> {
  if (!isRowId(postId) || !isVariantIndex(variantIndex)) {
    return { ok: false, message: INVALID_REQUEST }
  }

  const userId = await requireUserId()
  await requireEntitled(userId)

  const post = await getPostById(userId, postId)
  if (!post) return { ok: false, message: NO_POST }

  const variant = post.variants.find((candidate) => candidate.variantIndex === variantIndex)
  if (!variant) return { ok: false, message: INVALID_REQUEST }

  try {
    // The text comes from the stored variant, never from the client. A crafted
    // POST cannot use this to write arbitrary text into a post.
    const updated = await selectVariant(userId, post.id, variantIndex, variant.content)
    if (!updated) return { ok: false, message: NO_POST }
  } catch (error) {
    console.error(
      `LinkBud: chooseVariant failed for user ${userId} post ${post.id} - ${describeErrorForLog(error)}`,
    )
    return { ok: false, message: 'Something went wrong choosing that draft. Try again.' }
  }

  revalidateWriterSurfaces(post.slotId)
  return { ok: true }
}

/**
 * Save edited text.
 *
 * **Never rejects on length.** A draft over LinkedIn's limit is saved and the
 * editor warns; losing a customer's words to a validation rule is worse than
 * storing a post that is too long. The repository recomputes the preference
 * signals and reverts approval on this write.
 */
export async function saveDraft(postId: unknown, text: unknown): Promise<PostActionResult> {
  if (!isRowId(postId) || typeof text !== 'string') {
    return { ok: false, message: INVALID_REQUEST }
  }

  const userId = await requireUserId()
  await requireEntitled(userId)

  try {
    const updated = await saveFinalText(userId, postId, text)
    if (!updated) return { ok: false, message: NO_POST }
    revalidateWriterSurfaces(updated.slotId)
  } catch (error) {
    console.error(
      `LinkBud: saveDraft failed for user ${userId} post ${postId} - ${describeErrorForLog(error)}`,
    )
    return { ok: false, message: 'Something went wrong saving your draft. Try again.' }
  }

  return { ok: true }
}

/**
 * Mark a post ready, or take that back.
 *
 * **Not authority to publish** (Ruling R-M5-5). It records that the user
 * finished writing and reviewed this exact text; Milestone 6 still requires a
 * tap at publish time.
 */
export async function setReady(postId: unknown, ready: unknown): Promise<PostActionResult> {
  if (!isRowId(postId) || typeof ready !== 'boolean') {
    return { ok: false, message: INVALID_REQUEST }
  }

  const userId = await requireUserId()
  await requireEntitled(userId)

  try {
    const updated = await setApproved(userId, postId, ready)
    if (!updated) {
      return {
        ok: false,
        message: ready
          ? 'There is nothing to mark ready yet -- write the post first.'
          : NO_POST,
      }
    }
    revalidateWriterSurfaces(updated.slotId)
  } catch (error) {
    console.error(
      `LinkBud: setReady failed for user ${userId} post ${postId} - ${describeErrorForLog(error)}`,
    )
    return { ok: false, message: 'Something went wrong. Try again.' }
  }

  return { ok: true }
}

/** One optional revision pass. Stored as pending; the user accepts or discards. */
export async function polishDraft(postId: unknown): Promise<PostActionResult> {
  if (!isRowId(postId)) return { ok: false, message: INVALID_REQUEST }

  const userId = await requireUserId()
  await requireEntitled(userId)
  const { business, voice } = await loadInputs(userId)

  const post = await getPostById(userId, postId)
  if (!post) return { ok: false, message: NO_POST }
  if (post.finalText === null || post.finalText.trim().length === 0) {
    return { ok: false, message: 'There is nothing to polish yet -- choose a draft first.' }
  }

  try {
    const polished = await polish({
      text: post.finalText,
      business,
      voice,
      brief: briefFromPost(post),
      llm: createFallbackSession(),
    })
    await savePolish(userId, post.id, polished)
  } catch (error) {
    console.error(
      `LinkBud: polishDraft failed for user ${userId} post ${post.id} - ${describeErrorForLog(error)}`,
    )
    return { ok: false, message: describeWriterError(error) }
  }

  revalidateWriterSurfaces(post.slotId)
  return { ok: true }
}

/** Accept or discard a pending polish. Which way the user went is a signal. */
export async function resolvePolishAction(
  postId: unknown,
  outcome: unknown,
): Promise<PostActionResult> {
  if (!isRowId(postId) || !isPolishOutcome(outcome)) {
    return { ok: false, message: INVALID_REQUEST }
  }

  const userId = await requireUserId()
  await requireEntitled(userId)

  try {
    const updated = await resolvePolish(userId, postId, outcome)
    if (!updated) return { ok: false, message: NO_POST }
    revalidateWriterSurfaces(updated.slotId)
  } catch (error) {
    console.error(
      `LinkBud: resolvePolish failed for user ${userId} post ${postId} - ${describeErrorForLog(error)}`,
    )
    return { ok: false, message: 'Something went wrong. Try again.' }
  }

  return { ok: true }
}

/** Delete a post and its variants. Irreversible, and the dialog says so. */
export async function removePost(postId: unknown): Promise<PostActionResult> {
  if (!isRowId(postId)) return { ok: false, message: INVALID_REQUEST }

  const userId = await requireUserId()
  await requireEntitled(userId)

  const post = await getPostById(userId, postId)
  if (!post) return { ok: false, message: NO_POST }

  try {
    const deleted = await deletePost(userId, post.id)
    if (deleted === 0) return { ok: false, message: NO_POST }
  } catch (error) {
    console.error(
      `LinkBud: removePost failed for user ${userId} post ${post.id} - ${describeErrorForLog(error)}`,
    )
    return { ok: false, message: 'Something went wrong deleting that draft. Try again.' }
  }

  revalidateWriterSurfaces(post.slotId)
  return { ok: true }
}
