import { describe, expect, it } from 'vitest'
import { safeNext } from './safe-next'

const origin = 'http://localhost:3000'

describe('safeNext', () => {
  it('passes through a plain same-origin path', () => {
    expect(safeNext('/onboarding', origin)).toBe('/onboarding')
  })

  it('preserves a query string on a same-origin path', () => {
    expect(safeNext('/dashboard?tab=drafts', origin)).toBe('/dashboard?tab=drafts')
  })

  it('falls back to /dashboard when next is missing', () => {
    expect(safeNext(null, origin)).toBe('/dashboard')
  })

  it('neutralizes the @evil.com userinfo trick by keeping it as a same-origin path', () => {
    // The vulnerable code did `${origin}${next}`, i.e. string concatenation:
    // "http://localhost:3000" + "@evil.com" = "http://localhost:3000@evil.com",
    // which a URL parser reads as userinfo "localhost:3000" + host "evil.com".
    // `new URL(next, origin)` never does that concatenation — it resolves
    // "@evil.com" as a relative reference against the origin, so it can only
    // ever land back on our own origin as the literal path "/@evil.com".
    // Verified empirically (see safe-next.ts) rather than assumed.
    const result = safeNext('@evil.com', origin)
    expect(result).toBe('/@evil.com')
    expect(new URL(result, origin).origin).toBe(origin)
  })

  it('falls back to /dashboard for a protocol-relative host override', () => {
    expect(safeNext('//evil.com', origin)).toBe('/dashboard')
  })

  it('falls back to /dashboard for an absolute cross-origin URL', () => {
    expect(safeNext('https://evil.com', origin)).toBe('/dashboard')
  })

  it('falls back to /dashboard for a malformed value', () => {
    expect(safeNext('http://', origin)).toBe('/dashboard')
  })
})
