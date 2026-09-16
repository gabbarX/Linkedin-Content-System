import 'server-only'
import { LlmError } from '@/server/llm/client'

/**
 * Turn a caught generation failure into something the user can act on.
 * Same shape and reasoning as
 * `src/server/onboarding/describe-derivation-error.ts`, with two
 * differences: the reassurance is about the interview and voice profile
 * (which are what a strategy is built from, and are untouched by a failed
 * build), and a plan that did not validate gets its own line, because with
 * five model calls per build a shape failure is the most likely failure and
 * a second attempt usually clears it.
 *
 * Lives in its own module because a `'use server'` file may only export
 * async functions, and this is a plain synchronous function that should be
 * unit-tested directly.
 */
export function describeStrategyError(error: unknown): string {
  if (!(error instanceof LlmError)) {
    return 'Something went wrong building your strategy. Nothing you entered is lost -- try again in a moment.'
  }
  if (error.message.includes('OPENROUTER_API_KEY is not set')) {
    return 'The AI model is not configured yet, so retrying will not help until that is fixed on our side. Nothing you entered is lost.'
  }
  if (/OpenRouter returned 429/.test(error.message)) {
    return 'The AI model is rate-limited right now. Nothing you entered is lost -- wait a minute and try again.'
  }
  // A 502/503 from the provider, whether as the HTTP status or as an error
  // object inside a 200 (see completeJson). Observed live on the free
  // endpoint: "Service temporarily overloaded". Transient; a retry is right.
  if (/returned (an error \()?50[23]|overloaded|provider_unavailable|no instances/i.test(error.message)) {
    return 'The AI model is busy right now. Nothing you entered is lost -- wait a minute and try again.'
  }
  if (/did not match the expected shape/.test(error.message)) {
    return "The plan didn't come back in a usable shape -- that usually clears on a second attempt. Nothing you entered is lost; try again."
  }
  return 'The AI model returned an unexpected response. Nothing you entered is lost -- try again in a moment.'
}
