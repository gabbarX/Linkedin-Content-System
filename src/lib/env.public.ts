import { z } from 'zod'

/**
 * The public half of the environment — the three `NEXT_PUBLIC_*` values, and
 * nothing else.
 *
 * Split out of a single `src/lib/env.ts` on 2026-09-17. The reason is not
 * tidiness: the combined module declared `STRIPE_SECRET_KEY` and
 * `LINKEDIN_CLIENT_SECRET` in the same file a Client Component imported
 * `publicEnv` from. Nothing leaked — Next only inlines `NEXT_PUBLIC_*` and the
 * server schema is never evaluated in the browser — but the names of every
 * secret the product holds sat one line away from client-safe code, and the
 * next person to add a value had to know which half they were in. Now the file
 * they are editing tells them.
 *
 * This module must never import from `env.server.ts`, or the split does
 * nothing.
 */

/**
 * An empty variable is an unset variable.
 *
 * `.env.example` ships every not-yet-needed key as `KEY=`, and the setup
 * instructions say to copy it. Zod's `.optional()` admits `undefined`, not
 * `''`, so each of those blank lines read as a present-but-invalid value and
 * getServerEnv() threw naming ten keys nobody was supposed to have set yet.
 * It stayed hidden until the first server-side env read in a request path,
 * because everything before it used getPublicEnv().
 *
 * Applied to required keys too, deliberately: `KEY=` should be reported as
 * missing, which is what it is, rather than as a malformed value.
 *
 * Deliberately duplicated in `env.server.ts` rather than shared from a third
 * module. It is eight lines, and a module imported by both halves would be a
 * path for a server import to creep back into this client-safe file — which is
 * the one thing the split exists to prevent.
 */
function withoutBlanks(
  raw: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== ''),
  )
}

/** Safe to reference from client components. Never throws. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
} as const

export type PublicEnv = typeof publicEnv

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
})

export type ValidatedPublicEnv = z.infer<typeof publicSchema>

export function parsePublicEnv(
  raw: Record<string, string | undefined>,
): ValidatedPublicEnv {
  const result = publicSchema.safeParse(withoutBlanks(raw))
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    )
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`)
  }
  return result.data
}

let cachedPublic: ValidatedPublicEnv | undefined

/**
 * The three NEXT_PUBLIC_* values the Supabase clients depend on, validated.
 * Throws naming the offending variable.
 *
 * Each key is read as a literal member expression because Next.js inlines
 * NEXT_PUBLIC_* at build time only in that form — `process.env` as a whole
 * is empty in the browser bundle.
 *
 * Call this from inside a function body, never at module scope: the app must
 * keep building and prerendering with no credentials present.
 */
export function getPublicEnv(): ValidatedPublicEnv {
  cachedPublic ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  })
  return cachedPublic
}
