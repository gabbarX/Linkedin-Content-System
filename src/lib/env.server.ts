import { z } from 'zod'

/**
 * The server half of the environment — every secret, and the public values
 * server code also needs.
 *
 * Split out of a single `src/lib/env.ts` on 2026-09-17; see `env.public.ts`
 * for why. Import this only from server modules. Nothing here is safe to
 * reference from a Client Component, and the file carries no `server-only`
 * guard because it has to stay importable from `next.config`-adjacent and
 * script contexts — the discipline is the import path, not a runtime throw.
 */

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),

  // Added by later milestones. Optional until the milestone that needs them,
  // so the app boots throughout the build rather than only at the end.
  // Prisma. DATABASE_URL is the Supavisor transaction pooler (6543,
  // pgbouncer=true) used at runtime; DIRECT_URL is the direct connection (5432)
  // used only by the Prisma CLI. Optional so the app still builds with no
  // credentials — src/server/db/client.ts throws with a clear message instead.
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  SHORT_LINK_DOMAIN: z.url().optional(),
  // Either one configures the LLM gateway; Gemini wins when both are set.
  // See src/server/llm/client.ts for why there are two.
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  EXA_API_KEY: z.string().min(1).optional(),
  LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
  LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),
  LINKEDIN_REDIRECT_URI: z.url().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),

  // Razorpay (Milestone 4). Optional like every other later-milestone key, so
  // the app boots and builds without them.
  //
  // The names match the Razorpay dashboard's own wording rather than being
  // tidied into KEY_ID/KEY_SECRET here: the value is copied from that screen
  // into .env by hand, and a rename is one more chance to paste the wrong one.
  //
  // RAZORPAY_KEY is safe to show a browser — Checkout needs it — but is
  // deliberately NOT a NEXT_PUBLIC_ variable. A server action hands it to a
  // signed-in user who has asked to pay, rather than baking it into the bundle
  // every anonymous visitor downloads.
  RAZORPAY_KEY: z.string().min(1).optional(),
  RAZORPAY_SECRET: z.string().min(1).optional(),
  RAZORPAY_PLAN_ID: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),

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
 *
 * Deliberately duplicated in `env.public.ts` — see the note there.
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
