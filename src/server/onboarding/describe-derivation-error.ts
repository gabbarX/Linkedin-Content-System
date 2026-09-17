import 'server-only'
import { classifyLlmFailure, type LlmFailureKind } from '@/server/llm/classify-failure'

/**
 * Turn a caught derivation failure into something the user can act on.
 *
 * Classification moved to `@/server/llm/classify-failure` in Milestone 5; this
 * module now holds only the copy, as an exhaustive `Record` so a new failure
 * kind is a compile error rather than a silent fall-through. It previously
 * hand-wrote the same matching as the strategy describer and carried the same
 * two defects — a missing-key branch that could never fire, and a 429 branch
 * that stopped matching the day Gemini became the default provider.
 *
 * Two kinds that used to collapse into the generic message now have their own
 * copy: a busy provider, and a reply that did not match the schema. Both are
 * worth distinguishing because both clear on a retry, and the old message told
 * the user nothing about that.
 *
 * Every line reassures that the samples are saved, which is true by
 * construction: `addWritingSamples` runs before derivation is ever attempted,
 * so a failed model call cannot cost the user the text they just pasted.
 *
 * Lives in its own module because a `'use server'` file may only export async
 * functions, and this is a plain synchronous function a review asked to have
 * unit-tested directly rather than only through whichever branch a live call
 * happens to land on.
 */
const MESSAGES: Record<LlmFailureKind, string> = {
  'not-llm':
    'Something went wrong analysing your samples. Your samples are saved -- try again in a moment.',
  unconfigured:
    'The AI model is not configured yet, so retrying will not help until that is fixed on our side. Your samples are saved and nothing is lost.',
  'rate-limited':
    'The AI model is rate-limited right now. Your samples are saved -- wait a minute and try again.',
  busy: 'The AI model is busy right now. Your samples are saved -- wait a minute and try again.',
  shape:
    "The analysis didn't come back in a usable shape -- that usually clears on a second attempt. Your samples are saved; try again.",
  unknown:
    'The AI model returned an unexpected response. Your samples are saved -- try again in a moment.',
}

export function describeDerivationError(error: unknown): string {
  return MESSAGES[classifyLlmFailure(error)]
}
