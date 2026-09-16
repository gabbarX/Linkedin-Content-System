import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
import { isComplete, routeForStep } from '@/lib/onboarding/steps'
import { createServerClient } from '@/lib/supabase/server'
import { getProfile } from '@/server/db/repositories/profiles'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Supabase Auth owns identity; the profiles row owns everything the product
  // knows about the person. Scoped to user.id because Prisma bypasses RLS —
  // see src/server/db/client.ts.
  const profile = await getProfile(user.id)

  // A signed-in user with no profiles row means handle_new_user() did not fire.
  // The page still renders — locking someone out of their own account over a
  // missing display name would be worse — but this is the only place that
  // failure is observable, so it does not pass silently.
  if (!profile) {
    console.error(
      'LinkBud: authenticated user has no profiles row; the handle_new_user() trigger did not fire',
      user.id,
    )
  }

  // Route protection lives here, not in src/proxy.ts (proxy only refreshes
  // the session). A profile stuck mid-onboarding must not reach the
  // dashboard — but redirecting to a target the request is already at would
  // be a redirect loop, so the guard compares against the current path
  // rather than only recognising the onboarding routes. That also covers
  // 'strategy' and 'paywall' (see steps.ts — both route to /dashboard until
  // Milestones 3 and 4 build their pages): a request already for /dashboard
  // must not be redirected to /dashboard.
  //
  // Server Components cannot read the current pathname directly, so
  // proxy.ts forwards it as the `x-pathname` request header for exactly
  // this comparison.
  //
  // A null profile (the trigger didn't fire) is deliberately not routed by
  // step — there is no onboardingStep to route by, and the check above
  // already surfaces that failure without locking the user out.
  if (profile && !isComplete(profile.onboardingStep)) {
    const pathname = (await headers()).get('x-pathname') ?? ''
    const target = routeForStep(profile.onboardingStep)
    if (pathname !== target) {
      redirect(target)
    }
  }

  return (
    <div className="min-h-screen">
      <AppNav displayName={profile?.fullName ?? user.email ?? 'Your account'} />
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  )
}
