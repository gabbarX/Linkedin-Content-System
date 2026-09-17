import 'server-only'
import { classifyLlmFailure, type LlmFailureKind } from '@/server/llm/classify-failure'

/**
 * Turn a caught writer failure into something the user can act on.
 *
 * The third surface to need this, and the reason classification was pulled out
 * into `@/server/llm/classify-failure` rather than hand-written a third time —
 * the two existing copies had drifted and both carried the same two dead
 * branches. This module holds only copy, as an exhaustive `Record`, so adding
 * a failure kind is a compile error in all three places at once.
 *
 * The reassurance differs from the other two surfaces because what is durable
 * differs. By the time any of these can be shown the brief is already written
 * to the post row (Ruling R-M5-9), so a failed generation costs the three
 * variant calls and nothing the user did. Where a draft already exists, it is
 * untouched: generation replaces variants, never the text the user has edited.
 */
const MESSAGES: Record<LlmFailureKind, string> = {
  'not-llm':
    'Something went wrong writing this post. Your draft is untouched -- try again in a moment.',
  unconfigured:
    'The AI model is not configured yet, so retrying will not help until that is fixed on our side. Your draft is untouched.',
  'rate-limited':
    'The AI model is rate-limited right now. Your draft is untouched -- wait a minute and try again.',
  busy: 'The AI model is busy right now. Your draft is untouched -- wait a minute and try again.',
  shape:
    "The drafts didn't come back in a usable shape -- that usually clears on a second attempt. Your draft is untouched; try again.",
  unknown:
    'The AI model returned an unexpected response. Your draft is untouched -- try again in a moment.',
}

export function describeWriterError(error: unknown): string {
  return MESSAGES[classifyLlmFailure(error)]
}
