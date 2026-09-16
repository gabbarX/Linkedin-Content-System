import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/auth/safe-next'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'), origin)

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // The visitor is told only that sign-in failed, which is right for them and
    // useless for diagnosis: Supabase's reason (expired token, already-consumed
    // link, PKCE verifier mismatch) is the entire root cause and it is not
    // recoverable anywhere else. See the auth defect in docs/BACKLOG.md.
    // Interpolated rather than passed as an object: Error.name and
    // Error.message are non-enumerable, so logging the error (or a literal
    // built from it) serialises to `{}` in the dev server log. Verified.
    console.error(
      `LinkBud: exchangeCodeForSession failed - ${error.name}: ${error.message}` +
        ` (code=${error.code ?? 'none'}, status=${error.status ?? 'none'})`,
    )
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
