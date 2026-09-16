'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserClient } from '@/lib/supabase/browser'
import { publicEnv } from '@/lib/env'

/**
 * The two codes src/app/auth/callback/route.ts can redirect here with.
 * Anything else in ?error= is ignored rather than echoed back to the page.
 */
const CALLBACK_ERRORS: Record<string, string> = {
  missing_code:
    'That sign-in link has expired or has already been used. Request a new one below.',
  exchange_failed:
    'We could not complete that sign-in. Request a new link below.',
}

/**
 * Split out because useSearchParams() opts a component into client-side
 * rendering, and the App Router requires a Suspense boundary above it so the
 * rest of this page can still be prerendered.
 */
function CallbackError() {
  const code = useSearchParams().get('error')
  const message = code ? CALLBACK_ERRORS[code] : undefined
  if (!message) return null

  return (
    <p
      role="alert"
      className="mt-6 rounded-[var(--radius-md)] border border-[var(--color-danger)] p-4 text-sm text-[var(--color-danger)]"
    >
      {message}
    </p>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // createBrowserClient() throws when the NEXT_PUBLIC_* Supabase values are
    // missing. Surfacing that here rather than letting the promise reject
    // unhandled is what stops the button sitting on "Sending…" forever.
    let supabase
    try {
      supabase = createBrowserClient()
    } catch (cause) {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
      return
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${publicEnv.appUrl}/auth/callback` },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function signInWithGoogle() {
    setBusy(true)
    setError(null)
    let supabase
    try {
      supabase = createBrowserClient()
    } catch (cause) {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
      return
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${publicEnv.appUrl}/auth/callback` },
    })
    // On success the browser navigates away to Google immediately, so there
    // is no "success" branch here to reset `busy` for — only the error path
    // stays on this page.
    if (error) {
      setBusy(false)
      setError(error.message)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-display text-3xl">Sign in to LinkBud</h1>
      <p className="mt-2 text-[var(--color-text-muted)]">
        We&apos;ll email you a link. No password to remember.
      </p>

      <Suspense fallback={null}>
        <CallbackError />
      </Suspense>

      {sent ? (
        <p className="mt-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          Check your inbox — the link is on its way to {email}.
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourdomain.com"
            />
          </div>
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a link'}
          </Button>
        </form>
      )}

      <div className="my-6 flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        or
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <Button variant="outline" onClick={signInWithGoogle} className="w-full" disabled={busy}>
        {busy ? 'Redirecting…' : 'Continue with Google'}
      </Button>
    </main>
  )
}
