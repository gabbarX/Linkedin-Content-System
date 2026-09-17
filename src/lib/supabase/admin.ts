import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { getServerEnv } from '@/lib/env.server'

/**
 * Service-role client. Bypasses RLS entirely.
 * Only for cron workers and webhooks, where there is no user session.
 * Never import this from a component.
 */
export function createAdminClient() {
  const env = getServerEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
