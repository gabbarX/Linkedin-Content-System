import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  RADAR_NOT_YET,
  dashboardCopyForStep,
  type DashboardBandCopy,
  NEXT_SLOT_DRAFTED,
  NEXT_SLOT_READY,
  NEXT_SLOT_UNWRITTEN,
} from '@/lib/onboarding/dashboard-copy'
import { formatIsoDate, todayInTimeZone } from '@/lib/strategy/schedule'
import { FORMAT_META } from '@/lib/strategy/vocabulary'
import { createServerClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { getPostBySlot } from '@/server/db/repositories/posts'
import { getProfile } from '@/server/db/repositories/profiles'
import { getNextSlot } from '@/server/db/repositories/strategies'

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
  world: RADAR_NOT_YET,
  working: 'No published posts yet.',
}

/**
 * The authenticated home screen (spec §6).
 *
 * Three bands, each read from the user's real state rather than one
 * hard-coded message shown to everyone. From Milestone 3 the first band
 * shows the next scheduled slot when a strategy exists (spec §6 names
 * "next scheduled slot" as part of "Needs you now"; Ruling R-M3-8) --
 * there are no approvals or drafts to show until Milestones 5 and 6, so
 * the slot is what this band can honestly say is coming up. With no slot,
 * `dashboardCopyForStep` (`src/lib/onboarding/dashboard-copy.ts`) maps
 * every declared step to copy that is true for that user.
 *
 * "Today" is computed in the user's timezone, never the server's -- a
 * server west of Greenwich would otherwise show yesterday's slot as next.
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
  const nextSlot = profile ? await getNextSlot(user.id, todayInTimeZone(profile.timezone)) : null
  // The post for that slot, if one exists, so the band can say what is
  // actually true of it rather than a single message for every state.
  const nextPost = nextSlot ? await getPostBySlot(user.id, nextSlot.id) : null
  const nextPostText = nextPost?.finalText?.trim() ?? ''
  const nextSlotCopy =
    nextPost?.status === 'approved'
      ? NEXT_SLOT_READY
      : nextPostText.length > 0
        ? NEXT_SLOT_DRAFTED
        : NEXT_SLOT_UNWRITTEN

  return (
    <>
      <h1 className="font-display text-3xl">Today</h1>

      <div className="mt-10">
        <Band title="Needs you now" hint="Posts waiting for your approval, and what's coming up next.">
          {nextSlot ? (
            <div className="rounded-lg border border-border bg-surface p-6">
              <p className="text-xs font-medium tracking-wide text-text-muted uppercase">Next up</p>
              <p className="mt-2 text-sm">
                <time dateTime={nextSlot.scheduledOn} className="font-medium">
                  {formatIsoDate(nextSlot.scheduledOn, { weekday: true })}
                </time>
                <span className="text-text-muted">
                  {' '}· {nextSlot.pillarName} · {FORMAT_META[nextSlot.format].label}
                </span>
              </p>
              <h3 className="mt-2 text-base font-medium">{nextSlot.theme}</h3>
              <p className="mt-1 text-sm text-text-muted">{nextSlot.angle}</p>
              <p className="mt-4 text-sm text-text-muted">{nextSlotCopy}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {nextSlot.status === 'briefed' ? (
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/write/${nextSlot.id}`} />}
                  >
                    {nextPost ? 'Keep editing' : 'Write this post'}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/strategy" />}
                  >
                    Write this week&rsquo;s briefs
                  </Button>
                )}
                <Link
                  href="/calendar"
                  className="text-sm text-brand underline-offset-4 hover:underline"
                >
                  See the full calendar
                </Link>
              </div>
            </div>
          ) : (
            <Empty>{copy.needsYouNow}</Empty>
          )}
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
