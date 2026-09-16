import 'server-only'
import { LlmError, completeJson, type CompleteJsonOptions } from './client'

/**
 * One bounded fallback for model calls that a second provider could rescue.
 *
 * The gateway (`completeJson`) deliberately has no retry loop -- "callers
 * that want one can wrap this" -- so this is that wrapper, kept as narrow
 * as the evidence that motivated it. Measured 2026-09-16 while building
 * this milestone: the pinned free model's provider answered a run of
 * requests with `502 Service temporarily overloaded` (inside a 200), and
 * others with two minutes of keepalive whitespace followed by
 * `finish_reason: "error"`. A strategy is six calls; if any one of them
 * hits that, the user waits a minute and gets nothing. A second provider
 * for the same request turns that into a slower success.
 *
 * Rules, so this stays a fallback and never becomes a loop:
 *
 *   * **At most one extra call per request**, and only against
 *     `FALLBACK_MODEL`.
 *   * **Only for failures a different provider could fix** -- see
 *     `isTransientProviderFailure`. A missing key, a schema the model
 *     could not satisfy, or an unknown model fails exactly as before.
 *   * **Never when the caller pinned a model.** A pinned model is a
 *     decision; silently answering with a different one would undo it.
 *   * **Sticky within a session.** A generation is several calls in a
 *     row. Measured: with the default provider down, every call waited out
 *     the gateway's 90 s timeout before falling back, and a strategy took
 *     286 s. Once one call in a `FallbackSession` has fallen back, the rest
 *     go straight to the fallback model -- the provider was just observed
 *     to be down, and re-proving it five times costs the user minutes.
 *
 * Selected the same way the default was (`src/server/llm/client.ts`): among
 * the free models advertising structured outputs on 2026-09-16, this one
 * returned a schema-valid reply -- integer fields and enums intact -- in
 * ~30 s. Same caveat as the default: free model ids are withdrawn without
 * notice; if this starts returning 404, re-run the selection.
 *
 * Used by the strategy generator (six calls, one session) and, since the
 * same outage was watched turning the voice step into a dead end during
 * Milestone 3's browser QA, by voice derivation (one call). It is a wrapper
 * beside the gateway, not a change to it: completeJson itself still makes
 * exactly one call, and a caller that pins a model still gets exactly that.
 */
export const FALLBACK_MODEL = 'nex-agi/nex-n2.5-pro:free'

/**
 * Whether a different provider would plausibly succeed where this one
 * failed. Deliberately a list of observed shapes, not "anything that is
 * not a schema error": an unknown failure should surface, not be retried.
 */
export function isTransientProviderFailure(error: unknown): boolean {
  if (error instanceof Error && error.name === 'TimeoutError') return true
  if (!(error instanceof LlmError)) return false
  return (
    /returned (an error \()?50[23]/.test(error.message) ||
    /returned 429/.test(error.message) ||
    /overloaded|provider_unavailable|no instances/i.test(error.message) ||
    /returned no content/.test(error.message)
  )
}

export type FallbackSession = {
  /** True once any call in this session has fallen back. */
  readonly fellBack: boolean
  complete<T>(options: CompleteJsonOptions<T>): Promise<T>
}

/**
 * A session for one generation's worth of calls. See "Sticky within a
 * session" above. Each `complete` still makes at most two calls.
 */
export function createFallbackSession(): FallbackSession {
  let fellBack = false

  return {
    get fellBack() {
      return fellBack
    },
    async complete<T>(options: CompleteJsonOptions<T>): Promise<T> {
      if (options.model !== undefined) return completeJson(options)
      if (fellBack) return completeJson({ ...options, model: FALLBACK_MODEL })

      try {
        return await completeJson(options)
      } catch (error) {
        if (!isTransientProviderFailure(error)) throw error
        fellBack = true
        console.warn(
          `LinkBud: model call "${options.schemaName ?? 'response'}" failed on the default provider, falling back to ${FALLBACK_MODEL} for the rest of this generation - ${
            error instanceof Error ? `${error.name}: ${error.message}` : String(error)
          }`,
        )
        return completeJson({ ...options, model: FALLBACK_MODEL })
      }
    },
  }
}

/** A one-call session, for callers with a single request to make. */
export async function completeJsonWithFallback<T>(options: CompleteJsonOptions<T>): Promise<T> {
  return createFallbackSession().complete(options)
}
