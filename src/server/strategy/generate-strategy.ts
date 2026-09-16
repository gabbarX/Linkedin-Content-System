import 'server-only'
import { z } from 'zod'
import type { BusinessProfile } from '@/server/db/repositories/business-profiles'
import type { StrategyDraft } from '@/server/db/repositories/strategies'
import type { VoiceProfile } from '@/server/db/repositories/voice-profiles'
import { LlmError } from '@/server/llm/client'
import { createFallbackSession, type FallbackSession } from '@/server/llm/complete-with-fallback'
import { firstMondayAfter, todayInTimeZone, type Cadence } from '@/lib/strategy/schedule'
import {
  ARC_PHASES,
  FORMAT_META,
  MAX_PILLARS,
  MIN_PILLARS,
  PHASE_META,
  SLOT_FORMATS,
  WEEKS_IN_STRATEGY,
  weeksForPhase,
  type ArcPhase,
} from '@/lib/strategy/vocabulary'
import { assembleSlots, weekOutputSchema } from './assemble'
import { describeBusiness, describeTaboos, describeVoice } from './prompt-context'

/**
 * `generateStrategy(business, voice) -> Strategy` from spec §4.2, as five
 * model calls (Ruling R-M3-1):
 *
 *   1. **The plan.** Positioning, 4–5 pillars, the four arc phases described
 *      for this business, and twelve weekly themes. One call, because these
 *      have to cohere with each other.
 *   2. **The slots, one call per phase, in parallel.** Each gets the plan
 *      and that phase's three weekly themes and returns 3 × cadence slots.
 *      A single call for all 36–60 slots was measured near the gateway's
 *      timeout on the free model, and four smaller calls also make a
 *      shape failure cheaper to retry.
 *
 * Dates are arithmetic (`firstMondayAfter(todayInTimeZone(...))` and the
 * schedule in `assembleSlots`), never generated. Nothing here writes to the
 * database: the caller gets a `StrategyDraft` and hands it to
 * `replaceStrategy`, so a failure in any of the five calls costs nothing
 * but the calls.
 *
 * Per spec §7, nothing asserts the model's judgement in a test. The pure
 * seams -- `assembleSlots`, the date arithmetic -- are tested; the prompts
 * are not.
 */

const planSchema = z.object({
  positioning: z.string(),
  pillars: z
    .array(z.object({ name: z.string(), description: z.string() }))
    .refine(
      (pillars) => pillars.length >= MIN_PILLARS && pillars.length <= MAX_PILLARS,
      `Expected ${MIN_PILLARS}-${MAX_PILLARS} pillars`,
    ),
  phases: z.object({
    authority: z.string(),
    problem_aware: z.string(),
    offer_aware: z.string(),
    invitation: z.string(),
  }),
  week_themes: z
    .array(z.string())
    .refine((themes) => themes.length === WEEKS_IN_STRATEGY, `Expected exactly ${WEEKS_IN_STRATEGY} weekly themes`),
})

type Plan = z.infer<typeof planSchema>

const phaseSchema = z.object({ weeks: z.array(weekOutputSchema) })

const PLAN_SYSTEM = `You are a LinkedIn content strategist for one solo B2B coach or consultant who sells a high-ticket service. You are planning twelve weeks of posts whose job is to bring the right clients to that offer — not to collect likes.

You will be given the coach's business profile (their own words), their voice profile, and their posting cadence. Return a plan with exactly these parts:

- positioning: one sentence, in the third person, saying who this person is the go-to for and why. It is a compass for the writer, not a tagline.
- pillars: ${MIN_PILLARS}-${MAX_PILLARS} content pillars. Each has a short name (2-4 words) and a one-sentence description of what posts in this pillar prove about the coach or their offer. Pillars must be distinct from each other, specific to THIS business, and each must lead naturally toward the offer.
- phases: the twelve weeks run through four phases of three weeks each. Describe, for THIS business, what each phase does, in one or two sentences:
  - authority (weeks 1-3): ${PHASE_META.authority.purpose}
  - problem_aware (weeks 4-6): ${PHASE_META['problem-aware'].purpose}
  - offer_aware (weeks 7-9): ${PHASE_META['offer-aware'].purpose}
  - invitation (weeks 10-12): ${PHASE_META.invitation.purpose}
- week_themes: exactly twelve short themes (under ten words each), one per week in order, week 1 first. Each theme sits inside its phase and moves the reader one step closer to the offer.

Ground everything in the profile you are given. Do not invent credentials, clients, numbers or results that are not in it. Respect the off-limits topics absolutely.`

function buildPlanPrompt(business: BusinessProfile, voice: VoiceProfile, cadence: Cadence): string {
  return [
    'BUSINESS PROFILE (the coach’s own answers)',
    describeBusiness(business),
    '',
    describeTaboos(business),
    '',
    'VOICE PROFILE',
    describeVoice(voice),
    '',
    `CADENCE: ${cadence} posts a week for ${WEEKS_IN_STRATEGY} weeks.`,
  ].join('\n')
}

const SLOTS_SYSTEM = `You are a LinkedIn content strategist laying out the individual posts for one phase of a twelve-week plan for a solo B2B coach or consultant. You will be given the plan (positioning, numbered pillars, the phase's purpose and its three weekly themes), the business and voice profiles, and the cadence.

For each of the three weeks, return exactly the requested number of post slots. Each slot has:

- pillar: the NUMBER of the pillar it belongs to, from the numbered list.
- theme: the post's topic, under eight words.
- angle: the specific take or claim the post makes, one sentence. Not a topic — a position.
- format: one of ${SLOT_FORMATS.map((format) => `"${format}"`).join(', ')}. ${SLOT_FORMATS.map((format) => `${format} = ${FORMAT_META[format].description}`).join(' ')}
- brief: one sentence telling the writer what this post must accomplish for the reader and how it serves the phase.

Rules: vary the format within each week; use every pillar at least once across the phase; every angle must be something this coach could credibly say given their profile; never touch an off-limits topic; do not repeat an angle across the three weeks. Return only the weeks you were asked for.`

function buildPhasePrompt(
  plan: Plan,
  phase: ArcPhase,
  cadence: Cadence,
  business: BusinessProfile,
  voice: VoiceProfile,
): string {
  const weeks = weeksForPhase(phase)
  const phaseKey = phaseKeyFor(phase)
  return [
    'THE PLAN',
    `Positioning: ${plan.positioning.trim()}`,
    '',
    'Pillars (refer to them by number):',
    ...plan.pillars.map((pillar, index) => `${index + 1}. ${pillar.name.trim()} — ${pillar.description.trim()}`),
    '',
    `THIS PHASE: ${PHASE_META[phase].label} (weeks ${weeks[0]}-${weeks[weeks.length - 1]})`,
    `Purpose in general: ${PHASE_META[phase].purpose}`,
    `Purpose for this coach: ${plan.phases[phaseKey].trim()}`,
    '',
    'Weekly themes:',
    ...weeks.map((week) => `- Week ${week}: ${plan.week_themes[week - 1]?.trim() ?? ''}`),
    '',
    'BUSINESS PROFILE',
    describeBusiness(business),
    '',
    describeTaboos(business),
    '',
    'VOICE PROFILE',
    describeVoice(voice),
    '',
    `Return weeks ${weeks.join(', ')} with exactly ${cadence} slots each — ${weeks.length * cadence} slots in total.`,
  ].join('\n')
}

/** The arc phase names use hyphens; JSON keys sent to the model use
 * underscores so a model that struggles with quoted hyphenated keys has
 * one less thing to get wrong. This is the only place the two meet. */
function phaseKeyFor(phase: ArcPhase): keyof Plan['phases'] {
  switch (phase) {
    case 'authority':
      return 'authority'
    case 'problem-aware':
      return 'problem_aware'
    case 'offer-aware':
      return 'offer_aware'
    case 'invitation':
      return 'invitation'
    default: {
      const exhaustive: never = phase
      return exhaustive
    }
  }
}

export type GenerateStrategyInput = {
  business: BusinessProfile
  voice: VoiceProfile
  cadencePerWeek: Cadence
  /** The user's IANA zone, from profiles.timezone. Decides what "today" is. */
  timeZone: string
  /** Injectable for tests; defaults to the real clock. */
  now?: Date
  /** Share a fallback session with the calls that follow (draftWeek), so a
   * provider observed down here is not re-proven there. */
  llm?: FallbackSession
}

export async function generateStrategy(input: GenerateStrategyInput): Promise<StrategyDraft> {
  const { business, voice, cadencePerWeek } = input
  const startsOn = firstMondayAfter(todayInTimeZone(input.timeZone, input.now))

  // One session for all five calls here (and the brief call after, if the
  // caller passes it on), so a provider observed down on the plan call is
  // not re-proven down again (see complete-with-fallback).
  const llm = input.llm ?? createFallbackSession()

  const plan = await llm.complete({
    system: PLAN_SYSTEM,
    user: buildPlanPrompt(business, voice, cadencePerWeek),
    schema: planSchema,
    schemaName: 'strategy_plan',
  })

  const pillars = plan.pillars.map((pillar, index) => ({
    position: index + 1,
    name: pillar.name.trim(),
    description: pillar.description.trim(),
  }))
  if (pillars.some((pillar) => pillar.name.length === 0)) {
    throw new LlmError("The model's reply did not match the expected shape — a pillar has a blank name")
  }
  const weekThemes = plan.week_themes.map((theme) => theme.trim())
  if (weekThemes.some((theme) => theme.length === 0)) {
    throw new LlmError("The model's reply did not match the expected shape — a weekly theme is blank")
  }
  const positioning = plan.positioning.trim()
  if (positioning.length === 0) {
    throw new LlmError("The model's reply did not match the expected shape — positioning is blank")
  }

  const phaseOutputs = await Promise.all(
    ARC_PHASES.map((phase) =>
      llm.complete({
        system: SLOTS_SYSTEM,
        user: buildPhasePrompt(plan, phase, cadencePerWeek, business, voice),
        schema: phaseSchema,
        schemaName: 'strategy_phase_slots',
      }),
    ),
  )

  const slots = assembleSlots(
    phaseOutputs.flatMap((output) => output.weeks),
    pillars.length,
    cadencePerWeek,
    startsOn,
  )

  return {
    cadencePerWeek,
    startsOn,
    positioning,
    phases: {
      authority: plan.phases.authority.trim(),
      'problem-aware': plan.phases.problem_aware.trim(),
      'offer-aware': plan.phases.offer_aware.trim(),
      invitation: plan.phases.invitation.trim(),
    },
    weekThemes,
    pillars,
    slots,
  }
}
