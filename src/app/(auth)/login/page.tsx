'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserClient } from '@/lib/supabase/browser'
import { publicEnv } from '@/lib/env.public'

/**
 * The codes the two auth routes can redirect here with -- /auth/confirm for
 * emailed links, /auth/callback for the Google OAuth return. Anything else in
 * ?error= is ignored rather than echoed back to the page.
 *
 * `link_expired` and `invalid_link` are deliberately different messages:
 * an expired link is the user's problem to solve by requesting another, while a
 * malformed one means our email template is wrong and no amount of retrying
 * will help. Telling someone to request a new link when the template is broken
 * wastes their time and hides the real fault.
 */
const CALLBACK_ERRORS: Record<string, string> = {
  missing_code:
    'That sign-in link has expired or has already been used. Request a new one below.',
  exchange_failed:
    'We could not complete that sign-in. Request a new link below.',
  link_expired:
    'That link has expired or has already been used. Request a new one below.',
  invalid_link:
    "That sign-in link wasn't readable. Request a new one below -- if it keeps happening, the fault is ours, not yours.",
}

/** Shown to the visitor in place of the raw error thrown by getPublicEnv() —
 * that error names which environment variables are missing, which is
 * developer diagnostics, not something a visitor can act on. */
const CONFIG_ERROR_MESSAGE =
  "Sign-in isn't available right now. Please try again in a moment."

/**
 * `createBrowserClient()` throws (rather than returning an error object) when
 * the NEXT_PUBLIC_* Supabase values are missing or malformed — an
 * environment/configuration problem, not a Supabase auth outcome. Logging it
 * here keeps the full detail one keystroke away in devtools while the caller
 * shows the visitor a plain sentence instead.
 */
function handleConfigError(cause: unknown): string {
  console.error('LinkBud: Supabase client failed to initialize', cause)
  return CONFIG_ERROR_MESSAGE
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
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /**
   * createBrowserClient() throws when the NEXT_PUBLIC_* Supabase values are
   * missing. Surfacing that here rather than letting the promise reject
   * unhandled is what stops a button sitting on its pending label forever.
   */
  function client() {
    try {
      return createBrowserClient()
    } catch (cause) {
      setBusy(false)
      setError(handleConfigError(cause))
      return null
    }
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = client()
    if (!supabase) return

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setBusy(false)
      // Supabase returns a deliberately vague "Invalid login credentials" for
      // both a wrong password and an unknown address, which is correct: telling
      // an attacker which addresses have accounts is an account-enumeration
      // oracle. Pass it through rather than trying to be more helpful.
      setError(error.message)
      return
    }
    // The session cookie is set by the browser client. refresh() makes the
    // server components re-run and see it; push alone would render the
    // authenticated shell from a cache that predates the session.
    router.refresh()
    router.push('/dashboard')
  }

  async function sendMagicLink() {
    if (!email) {
      setError('Enter your email address first.')
      return
    }
    setBusy(true)
    setError(null)
    const supabase = client()
    if (!supabase) return

    const { error } = await supabase.auth.signInWithOtp({
      email,
      // /auth/confirm, not /auth/callback: the emailed link is verified by
      // token_hash so it works from any device. See that route for why.
      options: { emailRedirectTo: `${publicEnv.appUrl}/auth/confirm` },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function signInWithGoogle() {
    setBusy(true)
    setError(null)
    const supabase = client()
    if (!supabase) return

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
        Welcome back.
      </p>

      <Suspense fallback={null}>
        <CallbackError />
      </Suspense>

      {sent ? (
        <p className="mt-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          Check your inbox — the link is on its way to {email}.
        </p>
      ) : (
        <form onSubmit={signInWithPassword} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourdomain.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>

          <button
            type="button"
            onClick={sendMagicLink}
            disabled={busy}
            className="w-full text-center text-sm text-[var(--color-text-muted)] underline underline-offset-4 hover:text-[var(--color-text)] disabled:opacity-50"
          >
            Email me a sign-in link instead
          </button>
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
