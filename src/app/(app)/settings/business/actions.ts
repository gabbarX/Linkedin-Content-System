'use server'

import { redirect } from 'next/navigation'
import {
  parseBusinessProfileFormValues,
  type BusinessProfileFormValues,
} from '@/lib/onboarding/business-profile-edit'
import { createServerClient } from '@/lib/supabase/server'
import { upsertBusinessProfile } from '@/server/db/repositories/business-profiles'

/**
 * The Business Profile settings editor's server action (Task 10).
 *
 * Re-derives the signed-in user from the session (`supabase.auth.getUser()`)
 * rather than trusting a userId the client sent -- Prisma bypasses RLS, so
 * that would be a cross-customer data hole, not a bug (CLAUDE.md). Same
 * shape and reasoning as `src/app/(app)/onboarding/voice/actions.ts`.
 */

export type BusinessProfileActionResult = { ok: true } | { ok: false; message: string }

/** `Error.message`/`.name` are non-enumerable, so logging the error object
 * itself serialises to `{}` -- same reasoning as the voice and samples
 * actions. */
function describeErrorForLog(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/**
 * Validates and persists the whole business profile in one call --
 * `upsertBusinessProfile` creates the row on a user's first save (no
 * `business_profiles` row yet) and replaces it on every save after, which
 * is exactly what lets this page work the same way whether the interview
 * ever finished or not.
 */
export async function saveBusinessProfile(
  values: BusinessProfileFormValues,
): Promise<BusinessProfileActionResult> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parsed = parseBusinessProfileFormValues(values)
  if (!parsed.success) {
    return { ok: false, message: parsed.message }
  }

  try {
    await upsertBusinessProfile(user.id, parsed.edit)
  } catch (error) {
    console.error(
      `LinkBud: saveBusinessProfile failed to upsert the business profile for user ${user.id} - ${describeErrorForLog(error)}`,
    )
    return {
      ok: false,
      message: 'Something went wrong saving your changes. Try again.',
    }
  }

  return { ok: true }
}
