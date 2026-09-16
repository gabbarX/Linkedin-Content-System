import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * This route hands out a real, fully privileged session to anyone who asks for
 * it, with no credential of any kind. It exists only because auth is broken and
 * nothing behind (app) can otherwise be reached — see docs/BACKLOG.md.
 *
 * The environment guard is therefore the whole of its security, and these tests
 * are the only thing standing between "convenient in development" and "open
 * door in production". They assert the guard is an **allowlist** — exactly one
 * value of NODE_ENV is permitted — because a denylist that merely excludes
 * 'production' would leave preview deployments and any unset environment wide
 * open.
 */

const createUser = vi.fn()
const generateLink = vi.fn()
const verifyOtp = vi.fn()

const createAdminClient = vi.fn(() => ({
  auth: { admin: { createUser, generateLink } },
}))
const createServerClient = vi.fn(async () => ({ auth: { verifyOtp } }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/supabase/server', () => ({ createServerClient }))

const request = () => new NextRequest('http://localhost:3000/auth/dev-login')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('GET /auth/dev-login', () => {
  // Anything that is not the local dev server. 'production' and 'preview' are
  // the deployed cases; '' and undefined are what a misconfigured or minimal
  // runtime actually looks like, and are the ones a denylist would let through.
  for (const value of ['production', 'preview', 'staging', 'test', '']) {
    it(`404s when NODE_ENV is ${JSON.stringify(value)}`, async () => {
      vi.stubEnv('NODE_ENV', value)
      const { GET } = await import('./route')

      const response = await GET(request())

      expect(response.status).toBe(404)
      expect(createAdminClient).not.toHaveBeenCalled()
      expect(createServerClient).not.toHaveBeenCalled()
    })
  }

  it('404s when NODE_ENV is not set at all', async () => {
    vi.stubEnv('NODE_ENV', undefined)
    const { GET } = await import('./route')

    const response = await GET(request())

    expect(response.status).toBe(404)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('issues a session and redirects to the dashboard in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    createUser.mockResolvedValue({ error: null })
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'hashed-token-abc' } },
      error: null,
    })
    verifyOtp.mockResolvedValue({ error: null })
    const { GET, DEV_USER_EMAIL } = await import('./route')

    const response = await GET(request())

    expect(createUser).toHaveBeenCalledWith({
      email: DEV_USER_EMAIL,
      email_confirm: true,
    })
    // token_hash, not the PKCE code exchange: this path needs no code verifier,
    // which is exactly why it works while the emailed link does not.
    expect(verifyOtp).toHaveBeenCalledWith({
      type: 'magiclink',
      token_hash: 'hashed-token-abc',
    })
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/dashboard',
    )
  })

  it('treats an already-seeded user as success, not failure', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    // The steady state after the first call. Bailing out here would mean dev
    // login worked exactly once per database.
    createUser.mockResolvedValue({ error: { code: 'email_exists' } })
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'hashed-token-abc' } },
      error: null,
    })
    verifyOtp.mockResolvedValue({ error: null })
    const { GET } = await import('./route')

    const response = await GET(request())

    expect(response.status).toBe(307)
    expect(verifyOtp).toHaveBeenCalled()
  })

  it('reports the reason when the session cannot be issued', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    createUser.mockResolvedValue({ error: null })
    generateLink.mockResolvedValue({
      data: { properties: null },
      error: { message: 'signups are disabled' },
    })
    const { GET } = await import('./route')

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(await response.text()).toContain('signups are disabled')
    expect(verifyOtp).not.toHaveBeenCalled()
  })
})
