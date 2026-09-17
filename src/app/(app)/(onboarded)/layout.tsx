import { redirect } from 'next/navigation'
import { onboardingRouteFor } from '@/lib/onboarding/steps'
import { createServerClient } from '@/lib/supabase/server'
import { requireEntitled } from '@/server/billing/entitlement'
import { getProfile } from '@/server/db/repositories/profiles'

/**
 * Guards every route that requires onboarding to be finished — today, just
 * `dashboard/`. Ruling R8: this used to be a path comparison inside
 * `(app)/layout.tsx`, which depended on a header (`x-pathname`, forwarded by
 * `src/proxy.ts`) being present to avoid redirecting a request back to
 * itself. That dependency fails closed into an infinite redirect loop on
 * every authenticated page if the header is ever missing — a proxy matcher
 * change, a platform proxy stripping unknown headers, a future refactor —
 * and CLAUDE.md already records a Milestone 1 outage caused by proxy
 * misbehaviour, which is exactly the failure mode this route group avoids
 * structurally instead.
 *
 * `src/app/(app)/onboarding/**` is a sibling of this route group, not a
 * child of it, so it never renders through this layout at all — there is no
 * path comparison to get wrong, because there is nothing here to compare.
 *
 * Route groups don't affect the URL, so `/dashboard` is unchanged.
 *
 * `(app)/layout.tsx` already redirects an unauthenticated request to
 * `/login` and fetches the profile once for the nav — but Next.js layouts
 * don't share data down the tree except by each layout doing its own work,
 * so this layout re-fetches the user and profile itself. That duplicate
 * fetch is the (small, one-time-per-request) cost of the loop-proof
 * structure.
 */
export default async function OnboardedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Should be unreachable in practice — (app)/layout.tsx already redirects
  // an unauthenticated request — but this layout has no compile-time
  // guarantee of that, so it checks rather than assumes.
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)

  // No profile means the signup trigger hasn't fired; (app)/layout.tsx
  // already logs this. There is no onboardingStep to route by, so let the
  // request through rather than inventing a redirect target.
  if (!profile) return <>{children}</>

  const onboardingRoute = onboardingRouteFor(profile.onboardingStep)
  if (onboardingRoute) {
    redirect(onboardingRoute)
  }

  // Enforcement point 1 of 3 (see src/server/billing/entitlement.ts).
  //
  // Onboarding completeness and live entitlement are two independent facts and
  // both are checked here, in this order. A user who has not yet reached the
  // paywall step belongs on the step they are actually on, not on a billing
  // page for a product they have not finished setting up — so the onboarding
  // redirect goes first.
  //
  // Finishing the paywall step once is not a permanent grant: a mandate can be
  // revoked and a card can fail, which is why `done` is not enough on its own.
  await requireEntitled(user.id)

  return <>{children}</>
}
