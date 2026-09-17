import 'server-only'
import { LlmError } from './client'

/**
 * What kind of failure a caught model call was, in one place.
 *
 * Three surfaces need to turn a failure into something a user can act on — the
 * voice derivation, the strategy build and now the writer — and before this
 * module each wrote its own classification. Two of them got it wrong the same
 * way, which is the shape `CLAUDE.md` warns about: a boundary applied in one
 * place and reproduced slightly wrong in the next.
 *
 * The concrete bugs, both live before this existed:
 *
 *   * They tested for `'OPENROUTER_API_KEY is not set'`. `activeProvider()`
 *     selects *by key presence*, so with no key configured it throws "No LLM
 *     provider is configured" and that branch was unreachable on every
 *     provider. Dead code that read like a handled case.
 *   * They matched `/OpenRouter returned 429/`. Since Gemini became the
 *     default the message reads "Gemini returned 429", so a rate-limited user
 *     fell through to "the model returned an unexpected response" — advice to
 *     do nothing, for a problem that clears in a minute.
 *
 * **The patterns below deliberately do not name a provider.** Every message
 * `completeJson` throws is `<label> returned …`, so matching the structural
 * part rather than the label is correct for a provider that does not exist
 * yet. `classify-failure.test.ts` then asserts these cases over `PROVIDERS`
 * itself, so a third provider cannot be added without the assertion covering
 * it — the boundary is safe by construction rather than by remembering.
 */
export type LlmFailureKind =
  /** Not a model failure at all — a database write, a bug, anything. */
  | 'not-llm'
  /** No key, or the active provider's key is missing. Retrying cannot help. */
  | 'unconfigured'
  /** A 429. Clears on its own, usually quickly. */
  | 'rate-limited'
  /** Overloaded, unavailable, timed out, or answered with nothing. Transient. */
  | 'busy'
  /** Valid JSON that did not match the schema. Usually clears on a retry. */
  | 'shape'
  /** Something we have no specific advice about. */
  | 'unknown'

/** Covers both `No LLM provider is configured` and `<KEY>_API_KEY is not set`. */
const UNCONFIGURED = /No LLM provider is configured|_API_KEY is not set/

/** A 429, whether as an HTTP status or as an error object inside a 200. */
const RATE_LIMITED = /returned (?:an error \()?429/

/**
 * A 502/503, an overloaded or unavailable provider, or a completion that came
 * back empty. All transient, all worth a retry.
 * `isTransientProviderFailure` in `complete-with-fallback.ts` matches the same
 * shapes for the same reason; that one decides whether to retry automatically,
 * this one decides what to tell the user.
 */
const BUSY = /returned (?:an error \()?50[23]|overloaded|provider_unavailable|no instances|returned no content/i

const SHAPE = /did not match the expected shape/

export function classifyLlmFailure(error: unknown): LlmFailureKind {
  // A timeout is an AbortSignal.timeout rejection, not an LlmError, but it is
  // the most ordinary transient failure there is.
  if (error instanceof Error && error.name === 'TimeoutError') return 'busy'

  if (!(error instanceof LlmError)) return 'not-llm'

  if (UNCONFIGURED.test(error.message)) return 'unconfigured'
  // Rate limiting before busy: a 429 also reads as a provider problem, and
  // "wait a minute" is better advice than "it is busy".
  if (RATE_LIMITED.test(error.message)) return 'rate-limited'
  if (BUSY.test(error.message)) return 'busy'
  if (SHAPE.test(error.message)) return 'shape'
  return 'unknown'
}
