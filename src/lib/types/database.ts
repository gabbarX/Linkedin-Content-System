/**
 * PLACEHOLDER — hand-written, not generated.
 *
 * There is no live Supabase project yet, so `supabase gen types` cannot run.
 * This file exists only to satisfy TypeScript until one exists. It types the
 * `public.profiles` table to match `supabase/migrations/0001_profiles.sql`
 * exactly (see that file for the source of truth).
 *
 * Once a Supabase project exists, replace this entire file by running:
 *
 *   npx supabase gen types typescript --project-id <your-project-ref> > src/lib/types/database.ts
 *
 * The shape below mirrors what that command generates (a `Database` type
 * with `public.Tables.<table>.Row / Insert / Update`), so the real generated
 * file drops in without changing any call site that imports from here.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          timezone: string
          cadence_per_week: number
          preferred_post_time: string
          onboarding_step: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          timezone?: string
          cadence_per_week?: number
          preferred_post_time?: string
          onboarding_step?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          timezone?: string
          cadence_per_week?: number
          preferred_post_time?: string
          onboarding_step?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
