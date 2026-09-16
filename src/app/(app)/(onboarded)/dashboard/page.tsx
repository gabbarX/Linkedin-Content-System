import { redirect } from 'next/navigation'
import { dashboardCopyForStep, type DashboardBandCopy } from '@/lib/onboarding/dashboard-copy'
import { createServerClient } from '@/lib/supabase/server'
import { getProfile } from '@/server/db/repositories/profiles'

function Band({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-12">
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{hint}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-sm text-[var(--color-text-muted)]">
      {children}
    </div>
  )
}

/** Shown only when there is no profile row to read an onboarding step from
 * at all -- the signup trigger not firing, per `(app)/layout.tsx`'s own
 * handling of the same case. Step-agnostic because there is no step to be
 * specific about; `(app)/layout.tsx` already logs this as the real error. */
const NO_PROFILE_COPY: DashboardBandCopy = {
  needsYouNow: "We can't find your account details right now. Refresh, or contact support if this keeps happening.",
  world: "Your radar starts once your strategy exists.",
  working: 'No published posts yet.',
}

/**
 * The authenticated home screen (Task 11, spec §6).
 *
 * Three bands, each read from the user's real onboarding state rather than
 * one hard-coded message shown to everyone -- the previous "Finish
 * onboarding to get your first week" line was false for any user who had
 * actually finished, which today is the common case: the voice step
 * advances to `'strategy'`, not `'done'` (Ruling R11), and
 * `onboardingRouteFor('strategy')` is `null`, so a user who just finished
 * everything this milestone builds lands here. `dashboardCopyForStep`
 * (`src/lib/onboarding/dashboard-copy.ts`) is the single place that maps
 * every declared step to copy that is actually true for that user.
 */
export default async function DashboardPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // (app)/layout.tsx and (app)/(onboarded)/layout.tsx already redirect an
  // unauthenticated request; this is the same defensive re-check every
  // other page in this app makes, and this page needs user.id regardless.
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  const copy = profile ? dashboardCopyForStep(profile.onboardingStep) : NO_PROFILE_COPY

  return (
    <>
      <h1 className="font-display text-3xl">Today</h1>

      <div className="mt-10">
        <Band title="Needs you now" hint="Posts waiting for your approval.">
          <Empty>{copy.needsYouNow}</Empty>
        </Band>

        <Band
          title="What's happening in your world"
          hint="Fresh in your niche today, each one tap from a draft."
        >
          <Empty>{copy.world}</Empty>
        </Band>

        <Band title="What's working" hint="Clicks, conversations, and what LinkBud has learned.">
          <Empty>{copy.working}</Empty>
        </Band>
      </div>
    </>
  )
}
