import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const completeJson = vi.fn()
vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client')
  return { ...actual, completeJson }
})

const { LlmError } = await import('./client')
const { FALLBACK_MODEL, completeJsonWithFallback, createFallbackSession, isTransientProviderFailure } =
  await import('./complete-with-fallback')

const schema = z.object({ ok: z.boolean() })
const opts = { system: 's', user: 'u', schema }

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('isTransientProviderFailure', () => {
  it('is true for the provider-side failures observed live', () => {
    const transient = [
      new LlmError('OpenRouter returned an error (502): Upstream error from Nvidia: Service temporarily overloaded'),
      new LlmError('OpenRouter returned 503: no instances available'),
      new LlmError('OpenRouter returned 429: rate limited'),
      new LlmError('OpenRouter returned no content for model x (finish_reason: error). The provider may have refused the request or failed mid-reply.'),
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    ]
    for (const error of transient) expect(isTransientProviderFailure(error)).toBe(true)
  })

  it('is false for failures a different provider would not fix', () => {
    const permanent = [
      new LlmError('OPENROUTER_API_KEY is not set, so no model call can be made. See docs/ACCOUNTS.md.'),
      new LlmError("The model's reply did not match the expected shape — pillars: Expected 4-5 pillars"),
      new LlmError("The model's reply was not valid JSON: {"),
      new LlmError('OpenRouter returned 401: invalid key'),
      new LlmError('OpenRouter returned 404: unknown model'),
      new Error('ECONNRESET'),
      'a string',
    ]
    for (const error of permanent) expect(isTransientProviderFailure(error)).toBe(false)
  })
})

describe('completeJsonWithFallback', () => {
  it('returns the first answer and never touches the fallback when the default works', async () => {
    completeJson.mockResolvedValueOnce({ ok: true })

    await expect(completeJsonWithFallback(opts)).resolves.toEqual({ ok: true })
    expect(completeJson).toHaveBeenCalledTimes(1)
    expect(completeJson.mock.calls[0]?.[0]).not.toHaveProperty('model')
  })

  it('retries exactly once, on the fallback model, after a transient provider failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    completeJson
      .mockRejectedValueOnce(new LlmError('OpenRouter returned an error (502): overloaded'))
      .mockResolvedValueOnce({ ok: true })

    await expect(completeJsonWithFallback(opts)).resolves.toEqual({ ok: true })
    expect(completeJson).toHaveBeenCalledTimes(2)
    expect(completeJson.mock.calls[1]?.[0]).toMatchObject({ model: FALLBACK_MODEL })
  })

  it('rethrows a permanent failure without retrying -- a second provider cannot fix a bad schema or key', async () => {
    completeJson.mockRejectedValueOnce(new LlmError("The model's reply did not match the expected shape — x"))

    await expect(completeJsonWithFallback(opts)).rejects.toThrow(/expected shape/)
    expect(completeJson).toHaveBeenCalledTimes(1)
  })

  it('surfaces the fallback failure, not the first one, when both fail -- and stops there', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    completeJson
      .mockRejectedValueOnce(new LlmError('OpenRouter returned an error (502): overloaded'))
      .mockRejectedValueOnce(new LlmError('OpenRouter returned 429: rate limited'))

    await expect(completeJsonWithFallback(opts)).rejects.toThrow(/429/)
    expect(completeJson).toHaveBeenCalledTimes(2)
  })

  it('does not fall back when the caller pinned a model of their own', async () => {
    completeJson.mockRejectedValueOnce(new LlmError('OpenRouter returned an error (502): overloaded'))

    await expect(completeJsonWithFallback({ ...opts, model: 'some/pinned' })).rejects.toThrow(/502/)
    expect(completeJson).toHaveBeenCalledTimes(1)
  })
})

describe('createFallbackSession', () => {
  it('goes straight to the fallback model for every call after the first one falls back', async () => {
    // Measured: without this, a dead default provider cost 90 s per call
    // before each fallback, and a six-call generation took 286 s.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const session = createFallbackSession()
    completeJson
      .mockRejectedValueOnce(new LlmError('OpenRouter returned an error (502): overloaded'))
      .mockResolvedValue({ ok: true })

    await session.complete(opts)
    expect(session.fellBack).toBe(true)

    await session.complete(opts)
    await session.complete(opts)

    expect(completeJson).toHaveBeenCalledTimes(4)
    expect(completeJson.mock.calls[0]?.[0]).not.toHaveProperty('model')
    expect(completeJson.mock.calls[1]?.[0]).toMatchObject({ model: FALLBACK_MODEL })
    expect(completeJson.mock.calls[2]?.[0]).toMatchObject({ model: FALLBACK_MODEL })
    expect(completeJson.mock.calls[3]?.[0]).toMatchObject({ model: FALLBACK_MODEL })
  })

  it('stays on the default provider while it keeps working', async () => {
    const session = createFallbackSession()
    completeJson.mockResolvedValue({ ok: true })

    await session.complete(opts)
    await session.complete(opts)

    expect(session.fellBack).toBe(false)
    for (const call of completeJson.mock.calls) expect(call[0]).not.toHaveProperty('model')
  })

  it('does not retry a fallback-model failure a second time -- one extra call per request, sticky or not', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const session = createFallbackSession()
    completeJson
      .mockRejectedValueOnce(new LlmError('OpenRouter returned an error (502): overloaded'))
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new LlmError('OpenRouter returned 429: rate limited'))

    await session.complete(opts)
    await expect(session.complete(opts)).rejects.toThrow(/429/)
    expect(completeJson).toHaveBeenCalledTimes(3)
  })

  it('is independent between sessions -- one user’s bad luck does not pin the next user to the fallback', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    completeJson
      .mockRejectedValueOnce(new LlmError('OpenRouter returned an error (502): overloaded'))
      .mockResolvedValue({ ok: true })

    await createFallbackSession().complete(opts)
    await createFallbackSession().complete(opts)

    expect(completeJson.mock.calls[2]?.[0]).not.toHaveProperty('model')
  })
})
