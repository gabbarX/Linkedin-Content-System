import { describe, expect, it } from 'vitest'
import { LlmError } from '@/server/llm/client'
import { describeStrategyError } from './describe-strategy-error'

describe('describeStrategyError', () => {
  it('gives a distinct, non-retry message for a missing API key', () => {
    const message = describeStrategyError(
      new LlmError('OPENROUTER_API_KEY is not set, so no model call can be made. See docs/ACCOUNTS.md.'),
    )
    expect(message).toMatch(/not configured/i)
    expect(message).toMatch(/nothing (is|was) lost|nothing you entered is lost/i)
  })

  it('gives a distinct, retry-shortly message for a 429 rate limit', () => {
    const message = describeStrategyError(new LlmError('OpenRouter returned 429: rate limited'))
    expect(message).toMatch(/rate-limited/i)
    expect(message).toMatch(/try again/i)
  })

  it('calls an overloaded or unavailable provider busy, and says to retry', () => {
    const overloaded = describeStrategyError(
      new LlmError('OpenRouter returned an error (502): Upstream error from Nvidia: Service temporarily overloaded'),
    )
    const unavailable = describeStrategyError(new LlmError('OpenRouter returned 503: no instances available'))
    expect(overloaded).toMatch(/busy/i)
    expect(overloaded).toMatch(/try again/i)
    expect(unavailable).toBe(overloaded)
  })

  it('gives a distinct message for a plan that did not validate -- a retry usually fixes it', () => {
    const message = describeStrategyError(
      new LlmError("The model's reply did not match the expected shape — pillars: need 4-5"),
    )
    expect(message).toMatch(/unexpected|didn't come back|did not come back/i)
    expect(message).toMatch(/try again/i)
  })

  it('collapses every other LlmError to one generic recoverable message', () => {
    const a = describeStrategyError(new LlmError('OpenRouter returned 404: unknown model'))
    const b = describeStrategyError(new LlmError("The model's reply was not valid JSON: {"))
    expect(a).toBe(b)
    expect(a).toMatch(/try again/i)
  })

  it('falls back to a still-recoverable message for a non-LlmError throw', () => {
    const fromError = describeStrategyError(new Error('ECONNRESET'))
    const fromNonError = describeStrategyError('a thrown string')
    expect(fromError).toBe(fromNonError)
    expect(fromError).toMatch(/try again/i)
  })

  it('never says the word "error" to the user', () => {
    for (const thrown of [new LlmError('OpenRouter returned 500: boom'), new Error('x'), 'y']) {
      expect(describeStrategyError(thrown)).not.toMatch(/\berror\b/i)
    }
  })
})
