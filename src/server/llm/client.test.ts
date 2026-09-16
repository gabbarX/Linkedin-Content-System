import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/**
 * The gateway's contract is narrow on purpose: return data that has satisfied
 * the caller's schema, or throw. There is no third outcome, and in particular
 * it never returns something shaped nearly right.
 *
 * That matters because the caller is writing model output into columns with
 * check constraints. A value that slips through here fails at the database with
 * 23514, several layers away from the thing that produced it.
 *
 * Spec §7 says asserting an LLM returned a non-empty string is theatre. None of
 * these tests assert anything about the model's judgement. They cover the
 * transport, the parsing and the validation, all of which are ordinary code
 * with ordinary bugs.
 */

const getServerEnv = vi.fn<() => { OPENROUTER_API_KEY: string | undefined }>(
  () => ({ OPENROUTER_API_KEY: 'sk-or-test' }),
)
vi.mock('@/lib/env', () => ({ getServerEnv }))

const schema = z.object({ tone: z.string() })

type FetchMock = ReturnType<typeof vi.fn>

/**
 * mock.calls[0] is possibly undefined under noUncheckedIndexedAccess, and a
 * non-null assertion is banned. Throwing here also turns "fetch was never
 * called" into a clear failure rather than a confusing destructuring error.
 */
function firstCall(mock: FetchMock): { url: string; init: RequestInit } {
  const call = mock.mock.calls[0]
  if (!call) throw new Error('fetch was not called')
  return { url: String(call[0]), init: call[1] as RequestInit }
}

function requestBody(mock: FetchMock): Record<string, unknown> {
  return JSON.parse(String(firstCall(mock).init.body)) as Record<string, unknown>
}

function respondWith(content: string, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => content,
    json: async () => ({ choices: [{ message: { content } }] }),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: 'sk-or-test' })
})

describe('completeJson', () => {
  it('returns parsed, schema-valid data', async () => {
    vi.stubGlobal('fetch', respondWith('{"tone":"dry"}'))
    const { completeJson } = await import('./client')

    await expect(completeJson({ system: 's', user: 'u', schema })).resolves.toEqual(
      { tone: 'dry' },
    )
  })

  it('strips a markdown code fence before parsing', async () => {
    // Models wrap JSON in fences regardless of instructions or json_object
    // mode. This is the single most common way a working gateway breaks.
    vi.stubGlobal('fetch', respondWith('```json\n{"tone":"dry"}\n```'))
    const { completeJson } = await import('./client')

    await expect(completeJson({ system: 's', user: 'u', schema })).resolves.toEqual(
      { tone: 'dry' },
    )
  })

  it('throws when the response does not satisfy the schema', async () => {
    vi.stubGlobal('fetch', respondWith('{"tone":42}'))
    const { completeJson } = await import('./client')

    await expect(
      completeJson({ system: 's', user: 'u', schema }),
    ).rejects.toThrow(/did not match the expected shape/i)
  })

  it('throws when the response is not JSON at all', async () => {
    vi.stubGlobal('fetch', respondWith('I am sorry, I cannot help with that.'))
    const { completeJson } = await import('./client')

    await expect(
      completeJson({ system: 's', user: 'u', schema }),
    ).rejects.toThrow(/not valid JSON/i)
  })

  it('throws naming OPENROUTER_API_KEY when it is absent, without calling fetch', async () => {
    getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: undefined })
    const fetchMock = respondWith('{"tone":"dry"}')
    vi.stubGlobal('fetch', fetchMock)
    const { completeJson } = await import('./client')

    await expect(
      completeJson({ system: 's', user: 'u', schema }),
    ).rejects.toThrow(/OPENROUTER_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('includes the status and body when the API returns an error', async () => {
    vi.stubGlobal('fetch', respondWith('rate limit exceeded', false, 429))
    const { completeJson } = await import('./client')

    await expect(
      completeJson({ system: 's', user: 'u', schema }),
    ).rejects.toThrow(/429: rate limit exceeded/)
  })

  it('surfaces an error object carried inside a 200 response, with its message and code', async () => {
    // Observed live 2026-09-16: OpenRouter answers 200 with
    // {"error":{"message":"Upstream error from Nvidia: Service temporarily
    // overloaded","code":502,...}} and no choices at all. Reporting that as
    // "no content" hid the one fact the user could act on (wait and retry).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        id: 'gen-1',
        error: {
          message: 'Upstream error from Nvidia: Service temporarily overloaded',
          code: 502,
          metadata: { error_type: 'provider_unavailable' },
        },
      }),
    }))
    const { completeJson } = await import('./client')

    await expect(
      completeJson({ system: 's', user: 'u', schema }),
    ).rejects.toThrow(/OpenRouter returned an error \(502\): Upstream error from Nvidia: Service temporarily overloaded/)
  })

  it('names the finish_reason when a choice comes back with no content', async () => {
    // Observed live 2026-09-16: two minutes of whitespace keepalives, then a
    // choice with content null and finish_reason "error".
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '',
      json: async () => ({ choices: [{ finish_reason: 'error', message: { role: 'assistant', content: null } }] }),
    }))
    const { completeJson } = await import('./client')

    await expect(
      completeJson({ system: 's', user: 'u', schema }),
    ).rejects.toThrow(/no content.*finish_reason: error/i)
  })

  it('throws when the response carries no message content', async () => {
    // A provider returning a choices array with no content is a real failure
    // mode; without this branch it surfaces as "undefined is not valid JSON".
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '', json: async () => ({ choices: [] }),
    }))
    const { completeJson } = await import('./client')

    await expect(
      completeJson({ system: 's', user: 'u', schema }),
    ).rejects.toThrow(/no content/i)
  })

  it('sends the default model, the schema, and both messages', async () => {
    const fetchMock = respondWith('{"tone":"dry"}')
    vi.stubGlobal('fetch', fetchMock)
    const { completeJson, DEFAULT_MODEL } = await import('./client')

    await completeJson({ system: 'sys', user: 'usr', schema })

    const { url, init } = firstCall(fetchMock)
    expect(url).toContain('/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-or-test',
    )
    const body = requestBody(fetchMock)
    expect(body.model).toBe(DEFAULT_MODEL)
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ])
  })

  it('sends the schema as strict json_schema, with enums intact', async () => {
    // This is the difference between a hope and a guarantee. Measured against
    // the real API, naming the allowed values in the prompt returned
    // "informal", "moderate" and the number 0.25 for a three-value string
    // enum; sending the schema took the same prompt to 12/12 valid.
    const fetchMock = respondWith('{"mood":"calm"}')
    vi.stubGlobal('fetch', fetchMock)
    const { completeJson } = await import('./client')
    const enumSchema = z.object({ mood: z.enum(['calm', 'loud']) })

    await completeJson({ system: 's', user: 'u', schema: enumSchema })

    const format = requestBody(fetchMock).response_format as {
      type: string
      json_schema: { strict: boolean; schema: Record<string, unknown> }
    }
    expect(format.type).toBe('json_schema')
    expect(format.json_schema.strict).toBe(true)
    const properties = format.json_schema.schema.properties as {
      mood: { enum: string[] }
    }
    expect(properties.mood.enum).toEqual(['calm', 'loud'])
    // Providers reject unrecognised top-level keys under strict mode.
    expect(format.json_schema.schema).not.toHaveProperty('$schema')
    expect(format.json_schema.schema.additionalProperties).toBe(false)
  })

  it('honours a per-call model override', async () => {
    const fetchMock = respondWith('{"tone":"dry"}')
    vi.stubGlobal('fetch', fetchMock)
    const { completeJson } = await import('./client')

    await completeJson({ system: 's', user: 'u', schema, model: 'some/other' })

    expect(requestBody(fetchMock).model).toBe('some/other')
  })
})
