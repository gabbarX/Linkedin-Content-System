import { createBrowserClient as createClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'

export function createBrowserClient() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey)
}
