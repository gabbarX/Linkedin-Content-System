import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Local development sign-in. **Temporary scaffolding, not a feature.**
 *
 * The emailed magic link does not complete a sign-in (docs/BACKLOG.md), and
 * without a session nothing behind (app) can be built or browser-verified —
 * which is all of Milestone 2. This route unblocks that by minting a real
 * Supabase session for a seeded local account.
 *
 * It issues a genuine session rather than faking a user on purpose: the app's
 * own auth code is left completely untouched, so getUser(), the (app) guard,
 * the handle_new_user() trigger, RLS and the profile repository all run exactly
 * as they will in production. A stubbed user would have proved none of that,
 * and the stub would have had to live in the real auth path.
 *
 * Note what this route does NOT need: a PKCE code verifier. It verifies a
 * token_hash directly, which is the same mechanism Supabase's SSR guidance
 * recommends for email links. That it works here is a hint about the real fix.
 *
 * Delete this directory the day auth works.
 */

/** The seeded local account. Deliberately a reserved TLD — it can never be real. */
export const DEV_USER_EMAIL = 'dev@linkbud.example'

export async function GET(request: NextRequest) {
  // An allowlist, and it must stay one. This route grants a full session to an
  // unauthenticated GET, so the question is not "is this production?" but "is
  // this provably my laptop?". A denylist excluding 'production' would still
  // leave preview deployments, CI, and any runtime with NODE_ENV unset open.
  // next build and next start both set it to 'production'.
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not found', { status: 404 })
  }

  const { origin } = new URL(request.url)
  const admin = createAdminClient()

  // Idempotent. After the first run the account exists and this comes back
  // email_exists, which is the steady state rather than a failure.
  const { error: createError } = await admin.auth.admin.createUser({
    email: DEV_USER_EMAIL,
    email_confirm: true,
  })
  if (createError && createError.code !== 'email_exists') {
    return fail('could not create the dev user', createError.message)
  }

  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: DEV_USER_EMAIL,
  })
  const tokenHash = data?.properties?.hashed_token
  if (linkError || !tokenHash) {
    return fail(
      'could not generate a login token',
      linkError?.message ?? 'no hashed_token in the response',
    )
  }

  // Sets the session cookies on the response. This is the whole point of doing
  // it server-side: no verifier, no email round trip, no browser state.
  const supabase = await createServerClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })
  if (verifyError) {
    return fail('could not verify the login token', verifyError.message)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}

/**
 * Returns the real reason as plain text. This route is only ever reachable on a
 * developer's own machine, so the useful thing is the actual message, not a
 * polished sentence — and routing it through the login page's error map would
 * have shown nothing at all, since that map ignores codes it does not know.
 */
function fail(what: string, reason: string) {
  const message = `Dev login failed: ${what} - ${reason}`
  console.error(`LinkBud: ${message}`)
  return new NextResponse(message, { status: 500 })
}
