import { describe, expect, it } from 'vitest'
import { LlmError } from '@/server/llm/client'
import { describeDerivationError } from './describe-derivation-error'

describe('describeDerivationError', () => {
  it('gives a distinct, non-retry message for a missing API key', () => {
    const message = describeDerivationError(
      new LlmError('OPENROUTER_API_KEY is not set, so no model call can be made. See docs/ACCOUNTS.md.'),
    )
    expect(message).toContain('not configured yet')
    expect(message).toContain('samples are saved')
  })

  it('gives a distinct, retry-shortly message for a 429 rate limit', () => {
    const message = describeDerivationError(new LlmError('OpenRouter returned 429: rate limited'))
    expect(message).toContain('rate-limited')
    expect(message).toContain('samples are saved')
  })

  it('falls back to one generic recoverable message for any other LlmError', () => {
    const unknownModel = describeDerivationError(new LlmError('OpenRouter returned 404: unknown model'))
    const badJson = describeDerivationError(new LlmError("The model's reply was not valid JSON: {"))

    expect(unknownModel).toContain('samples are saved')
    // Both collapse to the identical fallback copy -- neither an unknown
    // model nor a malformed reply gives the user anything more specific to
    // act on than "this is recoverable, try again."
    expect(unknownModel).toBe(badJson)
  })

  it('falls back to a still-recoverable message for a non-LlmError throw', () => {
    // A transient database error (saving the derived profile, advancing the
    // step) or any other unexpected throw is not an LlmError at all, but
    // must still be recoverable -- the samples are already durable by the
    // time this runs regardless of what failed next.
    const fromError = describeDerivationError(new Error('ECONNRESET'))
    const fromNonError = describeDerivationError('a thrown string, not an Error at all')

    expect(fromError).toContain('samples are saved')
    expect(fromError).toBe(fromNonError)
  })
})
