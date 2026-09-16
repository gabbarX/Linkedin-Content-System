import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getPublicEnv, publicEnv } from '@/lib/env'

export async function proxy(request: NextRequest) {
  // No credentials configured: there is no session to refresh, and
  // @supabase/ssr throws on empty ones. Bail out before constructing the
  // client so a clone with no .env.local still serves the public pages
  // instead of 500ing on every route. This must stay ahead of
  // getPublicEnv() below, which throws by design.
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    return NextResponse.next({ request })
  }

  const env = getPublicEnv()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Refreshes the auth token. Required — do not remove.
  await supabase.auth.getUser()

  return response
}

export const config = {
  // Anything with a file extension is excluded: stylesheets, fonts and
  // source maps have no session to refresh and should not cost a getUser()
  // round trip.
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
}
