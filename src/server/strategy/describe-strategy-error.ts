import 'server-only'
import { classifyLlmFailure, type LlmFailureKind } from '@/server/llm/classify-failure'

/**
 * Turn a caught generation failure into something the user can act on.
 *
 * Classification moved to `@/server/llm/classify-failure` in Milestone 5. This
 * module now holds only the copy, as an exhaustive `Record`: adding a failure
 * kind is a compile error here rather than a silent fall-through to the
 * generic message. That matters because this file previously hand-wrote its
 * own matching and got two branches wrong — it tested for a missing-key string
 * `activeProvider()` can never emit, and it matched OpenRouter's name in a 429
 * message, so a rate-limited Gemini user was told the reply was unexpected
 * rather than to wait a minute.
 *
 * The reassurance in every line is that nothing the user entered is lost,
 * which is true: a failed build leaves the interview, the voice profile and
 * any existing strategy exactly as they were.
 *
 * Lives in its own module because a `'use server'` file may only export async
 * functions, and this is a plain synchronous function that should be
 * unit-tested directly.
 */
const MESSAGES: Record<LlmFailureKind, string> = {
  'not-llm':
    'Something went wrong building your strategy. Nothing you entered is lost -- try again in a moment.',
  unconfigured:
    'The AI model is not configured yet, so retrying will not help until that is fixed on our side. Nothing you entered is lost.',
  'rate-limited':
    'The AI model is rate-limited right now. Nothing you entered is lost -- wait a minute and try again.',
  busy: 'The AI model is busy right now. Nothing you entered is lost -- wait a minute and try again.',
  shape:
    "The plan didn't come back in a usable shape -- that usually clears on a second attempt. Nothing you entered is lost; try again.",
  unknown:
    'The AI model returned an unexpected response. Nothing you entered is lost -- try again in a moment.',
}

export function describeStrategyError(error: unknown): string {
  return MESSAGES[classifyLlmFailure(error)]
}
