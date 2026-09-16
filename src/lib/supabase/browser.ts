import { createBrowserClient as createClient } from '@supabase/ssr'
import { getPublicEnv } from '@/lib/env'

export function createBrowserClient() {
  // Inside the function body, never at module scope — the app must keep
  // building and prerendering with no credentials present.
  const env = getPublicEnv()
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
