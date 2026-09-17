/**
 * The writer's shared vocabulary (spec §4.4, §5).
 *
 * Client-safe on purpose, and deliberately free of `server-only` and of
 * anything under `@/server/**`: the editor renders these labels, the preview
 * draws its fold from these numbers, and the server actions validate against
 * the same tuples. One declaration means the screen and the check behind it
 * can never say different things — the same reasoning as
 * `src/lib/onboarding/samples.ts` and `src/lib/strategy/vocabulary.ts`.
 *
 * Every tuple here mirrors a check constraint in
 * `supabase/migrations/0006_writer.sql`. Keep them in step: a value that
 * type-checks but violates the constraint fails at runtime with 23514, which
 * is a worse error than a compile failure and arrives much later.
 */

/**
 * The five states from spec §5. **Milestone 5 writes only the first two**
 * (Ruling R-M5-5); `scheduled`, `published` and `failed` exist so Milestone 6
 * needs no migration.
 */
export const POST_STATUSES = [
  'draft',
  'approved',
  'scheduled',
  'published',
  'failed',
] as const
export type PostStatus = (typeof POST_STATUSES)[number]

/**
 * What this milestone is allowed to set.
 *
 * `approved` means the user finished writing and marked the text ready. **It
 * is not authority to publish.** Every publish is a user-initiated tap at
 * publish time (docs/LINKEDIN-COMPLIANCE.md §3: "the user pre-approved it" is
 * not a human tap), and editing an approved post returns it to `draft` so this
 * state always describes the exact text that was reviewed.
 */
export const WRITER_STATUSES = ['draft', 'approved'] as const
export type WriterStatus = (typeof WRITER_STATUSES)[number]

/**
 * The three variants are three different answers to "what carries this post",
 * not three samples of one prompt (Ruling R-M5-2).
 *
 * The order is the stored `variant_index`, and it is load-bearing: index 1
 * means story-forward on every post ever generated, which is the only reason
 * Milestone 9 can learn anything from which one a user picks. Reordering this
 * tuple would silently rewrite the meaning of every historical row.
 */
export const VARIANT_APPROACHES = ['hook-forward', 'story-forward', 'proof-forward'] as const
export type VariantApproach = (typeof VARIANT_APPROACHES)[number]

export type ApproachMeta = {
  /** Shown on the variant's pane. */
  label: string
  /** One line under the label, so the user knows what they are choosing between. */
  description: string
  /**
   * The only part of the variant prompt that differs between the three calls.
   * Everything else is a byte-identical prefix, which is what lets the
   * provider's implicit prompt caching hit (roadmap: "so the Voice Profile
   * context is not re-billed on every variant").
   */
  instruction: string
}

export const APPROACH_META: Record<VariantApproach, ApproachMeta> = {
  'hook-forward': {
    label: 'Hook-forward',
    description: 'Opens on the sharpest version of the claim, then earns it.',
    instruction:
      'Lead with the sharpest, most arresting version of the claim — a statement, a question or a number that stops the scroll on its own. The body then justifies what the opening asserted.',
  },
  'story-forward': {
    label: 'Story-forward',
    description: 'Opens in a specific moment, and the point lands late.',
    instruction:
      'Open inside a specific scene or moment — a person, a room, a conversation, a decision. Let the reader feel the situation before the lesson arrives, and land the point near the end rather than the start.',
  },
  'proof-forward': {
    label: 'Proof-forward',
    description: 'Opens on the evidence, then explains how it happened.',
    instruction:
      'Open on the concrete result or number from the proof point, then spend the body explaining how it happened. If no proof point was supplied, open on the most concrete specific available and do not invent a figure.',
  },
}

/** How many variants a generation produces. Spec §4.4: `Variant[3]`. */
export const VARIANT_COUNT = VARIANT_APPROACHES.length

export const POLISH_OUTCOMES = ['accepted', 'discarded'] as const
export type PolishOutcome = (typeof POLISH_OUTCOMES)[number]

/**
 * LinkedIn's hard ceiling for a text post.
 *
 * Not stated anywhere in the spec or the compliance document — it is a product
 * fact about the platform, recorded here as the single place the editor's
 * counter, the preview and any later publish check all read it from.
 *
 * **Exceeding it never blocks a save.** Losing a customer's words to a
 * validation rule is worse than storing a draft that is too long; the editor
 * warns loudly instead.
 */
export const LINKEDIN_CHAR_LIMIT = 3000

/**
 * Where the feed collapses a post behind "…see more".
 *
 * LinkedIn does not publish these numbers and they shift with viewport and
 * client, so this is an approximation chosen to be useful rather than exact:
 * roughly the point at which the fold lands on a desktop feed. It exists so a
 * writer can see whether their hook survives truncation, which is the single
 * most useful thing a preview can tell them. Treat it as a guide, not a
 * guarantee — the preview says so too.
 */
export const FOLD_CHARS = 210

/** The feed also folds on line count, whichever limit arrives first. */
export const FOLD_LINES = 3
