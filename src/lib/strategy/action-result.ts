/**
 * The result shape every strategy server action returns (a success
 * redirects before it resolves, so `ok: true` is what a caller sees only
 * from the actions that stay on the page). Declared once here, in
 * client-safe `src/lib`, so the `'use server'` module and the three Client
 * Components that call it share one definition instead of four structural
 * copies -- the M2 pattern of declaring it locally in each component was
 * three chances for the shapes to drift.
 */
export type StrategyActionResult = { ok: true } | { ok: false; message: string }
