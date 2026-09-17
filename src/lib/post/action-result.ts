/**
 * What every writer server action returns.
 *
 * Client-safe and declared here rather than in the `'use server'` module, for
 * the same reason `src/lib/strategy/action-result.ts` exists: a Client
 * Component needs this type to render a pending and an error state, and
 * importing it from an actions file drags a server module into the client
 * bundle.
 *
 * A discriminated union rather than `{ ok: boolean; message?: string }`, so
 * reading `message` on a success is a compile error rather than `undefined`
 * rendered into the page.
 */
export type PostActionResult = { ok: true } | { ok: false; message: string }
