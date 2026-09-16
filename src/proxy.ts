import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getPublicEnv, publicEnv } from '@/lib/env'

export async function proxy(request: NextRequest) {
  // (app)/layout.tsx redirects an incomplete user to their onboarding step,
  // but must not do that when the request is already for an onboarding
  // route — Server Components cannot read the current pathname themselves
  // (see the Next.js docs on usePathname: "Reading the current URL from a
  // Server Component is not supported"). Forwarding it as a request header
  // is the documented way to pass that one piece of routing data upstream
  // (see the NextResponse.next({ request: { headers } }) example in the
  // Next.js docs). This is plumbing, not a routing decision — the proxy
  // still makes none; (app)/layout.tsx does, exactly as before.
  //
  // Built fresh from `request.headers` every time it's called, rather than
  // snapshotted once, because `request.cookies.set()` below mutates
  // `request.headers` in place and the cookie-refresh flow depends on each
  // `NextResponse.next({ request })` picking up that latest state.
  const withPathname = () => {
    const headers = new Headers(request.headers)
    headers.set('x-pathname', request.nextUrl.pathname)
    return { headers }
  }

  // No credentials configured: there is no session to refresh, and
  // @supabase/ssr throws on empty ones. Bail out before constructing the
  // client so a clone with no .env.local still serves the public pages
  // instead of 500ing on every route. This is a cheap fast path only — it
  // does not need to agree exactly with getPublicEnv()'s schema, because
  // the try/catch below is what actually guarantees we never 500.
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    return NextResponse.next({ request: withPathname() })
  }

  // publicSchema validates a third value (NEXT_PUBLIC_APP_URL) that the
  // guard above does not check, and it validates all three as URLs/non-empty
  // rather than merely truthy. A partially- or malformed-configured deploy
  // (e.g. NEXT_PUBLIC_APP_URL unset, or NEXT_PUBLIC_SUPABASE_URL not a valid
  // URL) can pass the guard above and still fail here. Since the proxy only
  // refreshes sessions, degrade to "nobody stays signed in" rather than
  // 500ing every route — but log so a misconfigured deploy is diagnosable.
  let env
  try {
    env = getPublicEnv()
  } catch (error) {
    console.warn('proxy: getPublicEnv() failed, skipping session refresh', error)
    return NextResponse.next({ request: withPathname() })
  }

  let response = NextResponse.next({ request: withPathname() })

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
          response = NextResponse.next({ request: withPathname() })
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
