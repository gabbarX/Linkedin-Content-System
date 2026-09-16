import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Origin check. A cross-site form POST would otherwise be able to sign a user
 * out; the same hole on a later mutating handler would be able to do something
 * that matters, and this file is the template those get copied from.
 *
 * Hosts are compared rather than full origins because Vercel terminates TLS at
 * the edge, so `request.nextUrl` can carry `http:` while the browser sends an
 * `https:` Origin for the very same site.
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).host === request.nextUrl.host
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const supabase = await createServerClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
