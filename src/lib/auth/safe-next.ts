/**
 * Validates a post-auth redirect target against open-redirect attacks.
 *
 * `?next=` on `/auth/callback` is attacker-controlled input. Naively
 * concatenating it onto the app's origin (`${origin}${next}`) is exploitable:
 * a value like `@evil.com` turns `http://localhost:3000@evil.com` into a URL
 * whose host, per the WHATWG URL parser, is `evil.com` (with `localhost:3000`
 * read as userinfo) — sending a freshly authenticated user straight to an
 * attacker's domain.
 *
 * The two-argument `new URL(next, origin)` form resolves relative paths
 * correctly and rejects `//evil.com`, `https://evil.com`, and the `@evil.com`
 * userinfo trick — all three parse to an origin different from `origin`.
 */
export function safeNext(next: string | null, origin: string): string {
  if (!next) return '/dashboard'
  try {
    const parsed = new URL(next, origin)
    return parsed.origin === origin ? `${parsed.pathname}${parsed.search}` : '/dashboard'
  } catch {
    return '/dashboard'
  }
}
