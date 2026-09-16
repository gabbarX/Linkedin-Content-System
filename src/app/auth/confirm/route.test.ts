import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The email-link confirmation route.
 *
 * This is the path every emailed link takes: magic link, signup confirmation,
 * password recovery, email change. It verifies a token_hash directly and needs
 * no PKCE code verifier, which is the whole point — a verifier lives in the
 * browser that *requested* the link, so the code-exchange route could only ever
 * complete a sign-in in that same browser. People open email on their phones.
 *
 * `type` arrives from a URL and is therefore untrusted. It is checked against
 * the allowed set rather than cast, because a cast would hand an arbitrary
 * string straight to verifyOtp.
 */

const verifyOtp = vi.fn()
const createServerClient = vi.fn(async () => ({ auth: { verifyOtp } }))
vi.mock('@/lib/supabase/server', () => ({ createServerClient }))

const url = (query: string) =>
  new NextRequest(`http://localhost:3000/auth/confirm${query}`)

afterEach(() => {
  vi.clearAllMocks()
  verifyOtp.mockReset()
})

describe('GET /auth/confirm', () => {
  it('verifies the token and redirects to the dashboard by default', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    const { GET } = await import('./route')

    const response = await GET(url('?token_hash=abc123&type=magiclink'))

    expect(verifyOtp).toHaveBeenCalledWith({
      type: 'magiclink',
      token_hash: 'abc123',
    })
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/dashboard',
    )
  })

  it.each(['signup', 'magiclink', 'recovery', 'invite', 'email', 'email_change'])(
    'accepts the %s link type Supabase can send',
    async (type) => {
      verifyOtp.mockResolvedValue({ error: null })
      const { GET } = await import('./route')

      const response = await GET(url(`?token_hash=abc123&type=${type}`))

      expect(verifyOtp).toHaveBeenCalledWith({ type, token_hash: 'abc123' })
      expect(response.status).toBe(307)
    },
  )

  it('refuses a type outside the allowed set without calling Supabase', async () => {
    const { GET } = await import('./route')

    const response = await GET(url('?token_hash=abc123&type=wharrgarbl'))

    expect(verifyOtp).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?error=invalid_link',
    )
  })

  it('redirects to login when token_hash is absent, without calling Supabase', async () => {
    const { GET } = await import('./route')

    const response = await GET(url('?type=magiclink'))

    expect(verifyOtp).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?error=invalid_link',
    )
  })

  it('redirects to login when the token is expired or already used', async () => {
    verifyOtp.mockResolvedValue({
      error: { name: 'AuthApiError', message: 'Token has expired', code: 'otp_expired', status: 403 },
    })
    const { GET } = await import('./route')

    const response = await GET(url('?token_hash=stale&type=magiclink'))

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?error=link_expired',
    )
  })

  it('honours a same-origin next parameter', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    const { GET } = await import('./route')

    const response = await GET(
      url('?token_hash=abc123&type=magiclink&next=%2Fsettings'),
    )

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/settings',
    )
  })

  // The property that matters is "the user never leaves our origin", not any
  // particular fallback path. `@evil.com` resolves to the same-origin path
  // `/@evil.com` (safeNext's documented behaviour from Milestone 1), while the
  // other two fall back to /dashboard -- both are safe, and asserting the
  // origin tests the guarantee rather than the implementation's choice.
  it.each(['%40evil.com', '%2F%2Fevil.com', 'https%3A%2F%2Fevil.com'])(
    'keeps the redirect on our own origin for next=%s',
    async (hostile) => {
      verifyOtp.mockResolvedValue({ error: null })
      const { GET } = await import('./route')

      const response = await GET(
        url(`?token_hash=abc123&type=magiclink&next=${hostile}`),
      )

      const location = response.headers.get('location') ?? ''
      expect(new URL(location).origin).toBe('http://localhost:3000')
    },
  )
})
