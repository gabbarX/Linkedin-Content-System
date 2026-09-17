import 'server-only'
import { z, type ZodType } from 'zod'
import { getServerEnv } from '@/lib/env.server'

/**
 * The LLM gateway. One module, one entry point, no SDK.
 *
 * Moved here from Milestone 5 because the spec's build order could not be
 * followed as written — §4.1 needs deriveVoiceProfile in Milestone 2 and §4.2
 * needs generateStrategy in Milestone 3, both of which need a model (see the
 * amendment in spec §8).
 *
 * Both providers are HTTP APIs, so this is `fetch` and no dependency. Every
 * model call in LinkBud goes through here, which is what makes the model
 * choice, the spend and the failure behaviour one decision rather than a
 * dozen.
 *
 * Deliberately absent:
 *
 *   * **No retry loop.** A retry re-bills on every failure and turns a rate
 *     limit into a burst of rate limits. Callers that want one can wrap this;
 *     baking it in as the default is how a free tier becomes a suspended
 *     account.
 *   * **No streaming.** Nothing in Milestone 2 renders tokens as they arrive.
 *   * **No conversation state.** Every call is one system prompt and one user
 *     message. Structured extraction does not need history.
 */


/**
 * Free endpoints queue. Measured responses ran 8-12s on the default model and
 * up to 62s on the alternatives, so a short timeout would fail healthy calls --
 * but without any timeout a queued request holds a server request open
 * indefinitely.
 */
const TIMEOUT_MS = 90_000

/**
 * Pinned, and pinned on evidence rather than a spec sheet.
 *
 * `openrouter/free` -- the auto-router -- was the first choice and was wrong.
 * Measured over four consecutive calls it routed to four different models,
 * each of which invented its own vocabulary for the same enum: "informal",
 * "moderate", "strong", "first-person narrative", and in one case the number
 * 0.25 where a string was required. A default that returns a different type
 * between calls is not a default.
 *
 * Among free models advertising structured-output support, this one returned
 * schema-valid responses 3/3 at 8-12s. The alternatives were also 3/3 but took
 * 17-62s, which is not a page a user will wait on.
 *
 * Two things to know. Free model IDs are withdrawn without notice: if this
 * starts returning 404, re-run the selection rather than reaching for a paid
 * model by reflex. And free endpoints are rate-limited by request count, which
 * Milestone 5's writer -- three variants per post -- will feel long before
 * onboarding does.
 */
export const DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'

/**
 * OpenRouter's second leg, selected the same way the default was: among the
 * free models advertising structured outputs on 2026-09-16, this one returned
 * a schema-valid reply -- integer fields and enums intact -- in ~30 s. Same
 * caveat as the default: free model ids are withdrawn without notice; if this
 * starts returning 404, re-run the selection rather than reaching for a paid
 * model by reflex.
 *
 * It lives here rather than in `complete-with-fallback` because that module
 * imports this one, and a provider's two models belong to the provider.
 */
export const OPENROUTER_FALLBACK_MODEL = 'nex-agi/nex-n2.5-pro:free'

/**
 * Two providers, one gateway.
 *
 * The spec names OpenRouter as the single gateway and that is still what this
 * module is: one entry point, one request shape, one validation path. What
 * changed is that the *provider* behind it is a configuration fact rather
 * than a constant, because on 2026-09-17 OpenRouter's free tier could not
 * complete a strategy at all -- the pinned default answered `503 Upstream
 * error from Nvidia: Service temporarily overloaded` on every call, and the
 * free fallback then ran past the 90 s timeout on the real structured-output
 * calls. Two consecutive browser runs of Regenerate failed at 131 s and
 * 156 s. A product whose core action cannot complete is not blocked on a
 * better retry; it is blocked on a provider that answers.
 *
 * Both providers expose the same OpenAI-shaped `/chat/completions` with
 * `response_format: json_schema`, which is the whole reason this is a table
 * of two endpoints and not two clients. If a third one ever needs a different
 * request shape, that is the moment to split them -- not before.
 *
 * Selection is by key presence, Gemini first. Nothing in the app chooses a
 * provider, and no caller can: a caller that pins a model pins it on whichever
 * provider is configured.
 */
export type ProviderName = 'gemini' | 'openrouter'

export type Provider = {
  readonly name: ProviderName
  /** Names the provider in every error this module throws. */
  readonly label: string
  /** Named in the "nothing is configured" error, so the fix is obvious. */
  readonly keyName: 'GEMINI_API_KEY' | 'OPENROUTER_API_KEY'
  readonly endpoint: string
  /** The model every call uses unless the caller pinned one. */
  readonly defaultModel: string
  /** Used by `complete-with-fallback` after a transient provider failure. */
  readonly fallbackModel: string
}

/**
 * Gemini, via its OpenAI-compatible endpoint rather than the native
 * `generateContent` API. The native API wants an OpenAPI-subset
 * `responseSchema`, which would mean hand-converting the Zod schemas this
 * module already emits as JSON Schema -- a second schema to keep in step with
 * the first, which is how the two drift. The compatibility endpoint takes the
 * same `response_format` block OpenRouter takes, so the request this module
 * builds is unchanged.
 *
 * Models pinned the same way the OpenRouter ones were -- by sending the real
 * strategy-plan schema and counting what came back, not by reading a spec
 * sheet. Measured 2026-09-17, three consecutive runs each, every one
 * schema-valid with the array lengths intact:
 *
 *   | model                 | runs   | latency        |
 *   |-----------------------|--------|----------------|
 *   | gemini-3.8-flash      | 3/3    | 6.0-7.5 s      |
 *   | gemini-2.5-pro        | 3/3    | 13.6-16.2 s    |
 *   | gemini-3.5-flash      | 1/1    | 9.9 s          |
 *   | gemini-2.5-flash      | 1/1    | 9.0 s          |
 *   | gemini-3.1-flash-lite | 1/1    | 2.4 s          |
 *
 * Flash is the default: the calls here are structured extraction against a
 * fixed schema, not open-ended reasoning, and it was the fastest full model
 * measured. The lite model was faster still and is not the default on
 * purpose -- these prompts ask for judgement about a business, and that is
 * the one thing worth paying latency for.
 *
 * Pro is the fallback rather than another flash because a fallback that
 * shares a fleet with the thing that just failed is not a fallback. Both are
 * stable ids, not `-preview` and not the moving `-latest` aliases: a default
 * that can change under you is not a default.
 */
export const GEMINI: Provider = {
  name: 'gemini',
  label: 'Gemini',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  keyName: 'GEMINI_API_KEY',
  defaultModel: 'gemini-3.8-flash',
  fallbackModel: 'gemini-2.5-pro',
}

export const OPENROUTER: Provider = {
  name: 'openrouter',
  label: 'OpenRouter',
  keyName: 'OPENROUTER_API_KEY',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  defaultModel: DEFAULT_MODEL,
  fallbackModel: OPENROUTER_FALLBACK_MODEL,
}

/**
 * The configured provider, or a throw naming both keys.
 *
 * Read inside a function body, never at module scope: the app must keep
 * building with no credentials present.
 */
/**
 * Every provider this gateway knows, in preference order: Gemini first, then
 * OpenRouter (spec §8, amended 2026-09-17).
 *
 * Iterated rather than hand-listed at each site that cares, so adding a third
 * provider is one entry here and not a hunt for the places that enumerate two.
 * `classify-failure.ts` asserts over this tuple for the same reason.
 */
export const PROVIDERS = [GEMINI, OPENROUTER] as const

export function activeProvider(): Provider {
  const env = getServerEnv()
  for (const provider of PROVIDERS) {
    if (env[provider.keyName]) return provider
  }
  throw new LlmError(
    'No LLM provider is configured, so no model call can be made. Set ' +
      `${PROVIDERS.map((provider) => provider.keyName).join(' or ')}. See docs/ACCOUNTS.md.`,
  )
}

/** The active provider's key. Separated so `activeProvider` stays pure-ish. */
function apiKeyFor(provider: Provider): string {
  const env = getServerEnv()
  const key = provider.name === 'gemini' ? env.GEMINI_API_KEY : env.OPENROUTER_API_KEY
  if (!key) {
    throw new LlmError(
      `${provider.keyName} is not set, so no model call can be made. See docs/ACCOUNTS.md.`,
    )
  }
  return key
}

/** The model `complete-with-fallback` should retry on, for whichever provider is active. */
export function fallbackModel(): string {
  return activeProvider().fallbackModel
}

export type CompleteJsonOptions<T> = {
  system: string
  user: string
  /**
   * Sent to the provider as a JSON Schema *and* validated against on the way
   * back. The first constrains generation; the second catches a provider that
   * ignored it.
   */
  schema: ZodType<T>
  model?: string
  /** Names the schema in the request. Surfaces in provider-side errors. */
  schemaName?: string
}

/** Thrown for every failure mode, so callers catch one type. */
export class LlmError extends Error {
  override readonly name = 'LlmError'
}

/**
 * Models wrap JSON in markdown fences regardless of instructions and
 * regardless of json_object mode. This is the most common way a working
 * gateway breaks, and it is one line to survive.
 */
function stripFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed

  const firstNewline = trimmed.indexOf('\n')
  if (firstNewline === -1) return trimmed

  const withoutOpener = trimmed.slice(firstNewline + 1)
  const closer = withoutOpener.lastIndexOf('```')
  return (closer === -1 ? withoutOpener : withoutOpener.slice(0, closer)).trim()
}

/**
 * Ask for JSON matching `schema`, and return it validated — or throw.
 *
 * There is no third outcome. The callers write this output into columns with
 * check constraints, so a value that slips through here fails at the database
 * with 23514, several layers from whatever produced it.
 */
export async function completeJson<T>({
  system,
  user,
  schema,
  model,
  schemaName = 'response',
}: CompleteJsonOptions<T>): Promise<T> {
  // Inside the function body, never at module scope: the app must keep
  // building with no credentials present.
  const provider = activeProvider()
  const apiKey = apiKeyFor(provider)
  const modelId = model ?? provider.defaultModel

  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: modelId,
      // json_schema, not json_object. Asking for "JSON" and naming the allowed
      // values in the prompt was measured returning "informal", "moderate" and
      // 0.25 for a three-value string enum. Sending the schema makes the
      // provider constrain generation instead, which took the same prompt from
      // 0/4 to 12/12 valid.
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema: toJsonSchema(schema) },
      },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!response.ok) {
    // The body carries the reason — a rate limit, an unknown model, a rejected
    // key. Dropping it would leave only a number.
    const body = await response.text().catch(() => '<unreadable>')
    throw new LlmError(
      `${provider.label} returned ${response.status}: ${body.slice(0, 500)}`,
    )
  }

  const payload: unknown = await response.json()

  // Either provider can answer 200 with an error object and no choices -- observed
  // live as {"error":{"message":"Upstream error from Nvidia: Service
  // temporarily overloaded","code":502}}. Reporting that as "no content"
  // hides the one fact the caller can act on, so it is surfaced first.
  const upstreamError = extractError(payload)
  if (upstreamError) {
    throw new LlmError(
      `${provider.label} returned an error (${upstreamError.code ?? 'no code'}): ${upstreamError.message}`,
    )
  }

  const content = extractContent(payload)
  if (!content) {
    // Observed live: a choice with content null and finish_reason "error",
    // after the provider streamed keepalives for two minutes. Naming the
    // finish_reason is what lets a caller tell "provider failed mid-reply"
    // from "provider refused" -- one is worth retrying, the other is not.
    const finishReason = extractFinishReason(payload)
    throw new LlmError(
      `${provider.label} returned no content for model ${modelId}` +
        (finishReason ? ` (finish_reason: ${finishReason})` : '') +
        '. The provider may have refused the request or failed mid-reply.',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripFence(content))
  } catch {
    throw new LlmError(
      `The model's reply was not valid JSON: ${content.slice(0, 300)}`,
    )
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new LlmError(
      `The model's reply did not match the expected shape — ${issues}`,
    )
  }
  return result.data
}

/**
 * Zod 4 emits JSON Schema directly, including `additionalProperties: false`,
 * so no dependency and no hand-maintained duplicate of the schema. `$schema` is
 * stripped because providers reject unrecognised top-level keys under strict
 * mode.
 */
function toJsonSchema(schema: ZodType<unknown>): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<
    string,
    unknown
  >
  return rest
}

/** An `error` object inside an otherwise-OK payload, narrowed by hand. */
function extractError(payload: unknown): { message: string; code: number | string | null } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const error = (payload as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return null

  const message = (error as { message?: unknown }).message
  const code = (error as { code?: unknown }).code
  return {
    message: typeof message === 'string' && message.length > 0 ? message : 'unknown error',
    code: typeof code === 'number' || typeof code === 'string' ? code : null,
  }
}

/** `choices[0].finish_reason`, if the payload has one. */
function extractFinishReason(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const reason = (choices[0] as { finish_reason?: unknown }).finish_reason
  return typeof reason === 'string' ? reason : null
}

/** Narrowed by hand rather than trusting the response shape. */
function extractContent(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null

  const message = (choices[0] as { message?: unknown }).message
  if (typeof message !== 'object' || message === null) return null

  const content = (message as { content?: unknown }).content
  return typeof content === 'string' && content.length > 0 ? content : null
}
