import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/auth/safe-next'

/**
 * Where every emailed authentication link lands: magic link, signup
 * confirmation, password recovery, email change.
 *
 * It verifies a `token_hash` directly, which needs no PKCE code verifier — and
 * that is the entire reason this route exists. The verifier lives in the
 * browser that *requested* the link, so `/auth/callback`'s code exchange can
 * only ever complete a sign-in in that same browser. People request a link on a
 * laptop and open the email on a phone; that has to work.
 *
 * `/auth/callback` is still correct for Google OAuth, where the flow begins and
 * ends in one browser and the verifier is always present.
 *
 * **The email templates must point here.** Supabase's defaults use
 * `{{ .ConfirmationURL }}`, which routes through its own `/auth/v1/verify` and
 * hands our callback a `code`. See docs/ACCOUNTS.md for the exact values.
 */

/**
 * The link types Supabase can send. `type` arrives from a URL and is therefore
 * untrusted: it is checked against this set rather than cast, because a cast
 * would pass an arbitrary string straight into verifyOtp.
 */
const EMAIL_OTP_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const

type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number]

function toEmailOtpType(value: string | null): EmailOtpType | null {
  return EMAIL_OTP_TYPES.find((allowed) => allowed === value) ?? null
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = toEmailOtpType(searchParams.get('type'))
  const next = safeNext(searchParams.get('next'), origin)

  // A link missing either half is malformed rather than expired — most likely a
  // mangled email template. Say so distinctly, because the two need different
  // fixes and telling the user to request a new link would waste their time.
  if (!tokenHash || !type) {
    console.error(
      `LinkBud: /auth/confirm called without a usable link (token_hash ${
        tokenHash ? 'present' : 'missing'
      }, type ${searchParams.get('type') ?? 'missing'})`,
    )
    return NextResponse.redirect(`${origin}/login?error=invalid_link`)
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    // Interpolated, not passed as an object: Error.name and Error.message are
    // non-enumerable and serialise to `{}` in the dev server log.
    console.error(
      `LinkBud: verifyOtp failed - ${error.name}: ${error.message}` +
        ` (code=${error.code ?? 'none'}, status=${error.status ?? 'none'}, type=${type})`,
    )
    return NextResponse.redirect(`${origin}/login?error=link_expired`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
