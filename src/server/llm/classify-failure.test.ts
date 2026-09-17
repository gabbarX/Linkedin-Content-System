import { describe, expect, it } from 'vitest'
import { classifyLlmFailure } from './classify-failure'
import { LlmError, PROVIDERS } from './client'

/**
 * The bug this module exists to kill.
 *
 * `describe-strategy-error.ts` and `describe-derivation-error.ts` each
 * hand-wrote their own classification, and both got it wrong the same way:
 * they tested for `'OPENROUTER_API_KEY is not set'`, which `activeProvider()`
 * can never emit (it selects *by key presence*, so with no key at all it
 * throws "No LLM provider is configured"), and they matched
 * `/OpenRouter returned 429/`, which never matches once Gemini is the active
 * provider and the message reads "Gemini returned 429". A rate-limited Gemini
 * user was told "the model returned an unexpected response" instead of "wait a
 * minute and try again".
 *
 * The writer would have been the third copy. So classification happens once,
 * here, and the `it.each(PROVIDERS)` cases below are the part that matters:
 * they assert over the provider table itself, so a third provider added to
 * `client.ts` without a thought for this module fails a test rather than
 * silently falling through to "unexpected".
 */

describe('classifyLlmFailure', () => {
  it('separates a non-LlmError, which could be anything', () => {
    expect(classifyLlmFailure(new Error('database exploded'))).toBe('not-llm')
    expect(classifyLlmFailure('a string')).toBe('not-llm')
    expect(classifyLlmFailure(null)).toBe('not-llm')
  })

  it('recognises no provider being configured at all', () => {
    // The real message from activeProvider(), which is the only one reachable
    // when nothing is set.
    const error = new LlmError(
      'No LLM provider is configured, so no model call can be made. Set GEMINI_API_KEY or OPENROUTER_API_KEY. See docs/ACCOUNTS.md.',
    )
    expect(classifyLlmFailure(error)).toBe('unconfigured')
  })

  it('recognises a shape failure', () => {
    const error = new LlmError(
      "The model's reply did not match the expected shape — positioning: blank",
    )
    expect(classifyLlmFailure(error)).toBe('shape')
  })

  it('treats a timeout as transient', () => {
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    expect(classifyLlmFailure(timeout)).toBe('busy')
  })

  it('falls through to unknown for a failure it has no advice about', () => {
    expect(classifyLlmFailure(new LlmError('Gemini returned 400: malformed request'))).toBe(
      'unknown',
    )
  })

  // These are the structural cases. Every provider in the table, not the two
  // that happen to exist today.
  describe.each(PROVIDERS)('for $label', (provider) => {
    it('classifies a missing key as unconfigured', () => {
      const error = new LlmError(
        `${provider.keyName} is not set, so no model call can be made. See docs/ACCOUNTS.md.`,
      )
      expect(classifyLlmFailure(error)).toBe('unconfigured')
    })

    it('classifies a 429 as rate-limited', () => {
      expect(
        classifyLlmFailure(new LlmError(`${provider.label} returned 429: quota exceeded`)),
      ).toBe('rate-limited')
    })

    it('classifies a 503 as busy', () => {
      expect(
        classifyLlmFailure(new LlmError(`${provider.label} returned 503: unavailable`)),
      ).toBe('busy')
    })

    it('classifies an error object inside a 200 as busy', () => {
      expect(
        classifyLlmFailure(
          new LlmError(
            `${provider.label} returned an error (503): Service temporarily overloaded`,
          ),
        ),
      ).toBe('busy')
    })

    it('classifies a rate limit reported inside a 200 as rate-limited', () => {
      expect(
        classifyLlmFailure(
          new LlmError(`${provider.label} returned an error (429): rate limit reached`),
        ),
      ).toBe('rate-limited')
    })

    it('classifies an overloaded provider as busy', () => {
      expect(
        classifyLlmFailure(
          new LlmError(`${provider.label} returned an error (provider_unavailable): no instances`),
        ),
      ).toBe('busy')
    })

    it('classifies an empty completion as busy', () => {
      expect(
        classifyLlmFailure(
          new LlmError(`${provider.label} returned no content (finish_reason: error)`),
        ),
      ).toBe('busy')
    })
  })
})
