import { z } from 'zod'

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Added by later milestones. Optional until the milestone that needs them,
  // so the app boots throughout the build rather than only at the end.
  SHORT_LINK_DOMAIN: z.string().url().optional(),
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

export function parseServerEnv(
  raw: Record<string, string | undefined>,
): ServerEnv {
  const result = serverSchema.safeParse(raw)
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

/** Safe to reference from client components. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
} as const

export type PublicEnv = typeof publicEnv
