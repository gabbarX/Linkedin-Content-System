import 'server-only'
import { LlmError } from '@/server/llm/client'

/**
 * Turn a caught derivation failure into something the user can act on
 * (Task 8). A missing key and a rate limit are different problems with
 * different responses (task brief): one needs a fix on our side and
 * retrying will not help, the other resolves itself shortly. Everything
 * else -- an unknown model, a malformed reply, a dropped connection, a
 * transient database error saving the result or advancing the step --
 * collapses into one generic, still-recoverable message, because there is
 * nothing more specific the user could act on for any of them, and in every
 * case the samples that got this far are already durable.
 *
 * Lives in its own module, not inline in
 * `src/app/(app)/onboarding/samples/actions.ts`, for a mechanical reason: a
 * `'use server'` file may only export async functions -- Next.js rejects the
 * build otherwise ("Server Actions must be async functions") -- and this is
 * a plain synchronous function that a review asked to have unit-tested
 * directly, not only indirectly through whichever branch a live model call
 * happens to land on.
 */
export function describeDerivationError(error: unknown): string {
  if (!(error instanceof LlmError)) {
    return 'Something went wrong analysing your samples. Your samples are saved -- try again in a moment.'
  }
  if (error.message.includes('OPENROUTER_API_KEY is not set')) {
    return 'The AI model is not configured yet, so retrying will not help until that is fixed on our side. Your samples are saved and nothing is lost.'
  }
  if (/OpenRouter returned 429/.test(error.message)) {
    return 'The AI model is rate-limited right now. Your samples are saved -- wait a minute and try again.'
  }
  return 'The AI model returned an unexpected response. Your samples are saved -- try again in a moment.'
}
