import { z } from 'zod'

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Added by later milestones. Optional until the milestone that needs them,
  // so the app boots throughout the build rather than only at the end.
  // Prisma. DATABASE_URL is the Supavisor transaction pooler (6543,
  // pgbouncer=true) used at runtime; DIRECT_URL is the direct connection (5432)
  // used only by the Prisma CLI. Optional so the app still builds with no
  // credentials — src/server/db/client.ts throws with a clear message instead.
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  SHORT_LINK_DOMAIN: z.string().url().optional(),
  // Either one configures the LLM gateway; Gemini wins when both are set.
  // See src/server/llm/client.ts for why there are two.
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  EXA_API_KEY: z.string().min(1).optional(),
  LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
  LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),
  LINKEDIN_REDIRECT_URI: z.string().url().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_ID: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
})

export type ServerEnv = z.infer<typeof serverSchema>

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
 */
function withoutBlanks(
  raw: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== ''),
  )
}


export function parseServerEnv(
  raw: Record<string, string | undefined>,
): ServerEnv {
  const result = serverSchema.safeParse(withoutBlanks(raw))
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    )
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`)
  }
  return result.data
}

let cached: ServerEnv | undefined

/** Server-only configuration. Throws on first access if anything is missing. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}

/** Safe to reference from client components. Never throws. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
} as const

export type PublicEnv = typeof publicEnv

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
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
