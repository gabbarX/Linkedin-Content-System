import { redirect } from 'next/navigation'
import { CancelSubscription } from '@/components/billing/cancel-subscription'
import { StartSubscription } from '@/components/billing/start-subscription'
import { PLAN_PRICE_LABEL } from '@/lib/billing/plan'
import { describeStatus } from '@/lib/billing/subscription'
import { createServerClient } from '@/lib/supabase/server'
import {
  cancelSubscription,
  confirmSubscription,
  startSubscription,
} from '@/server/billing/actions'
import { loadEntitlement } from '@/server/billing/entitlement'
import { getProfile } from '@/server/db/repositories/profiles'

/**
 * Billing — the paywall and the management screen, in one page.
 *
 * **It must stay outside the `(onboarded)` route group.** That group's layout
 * sends an unentitled user here; a `/billing` inside it would redirect to
 * itself forever. The loop is prevented structurally, by where this file sits,
 * not by comparing paths (Ruling R8, and the note on `PAGE_ROUTE_BY_STEP`).
 *
 * One page rather than a separate `/onboarding/paywall`, because the wizard's
 * first payment and a lapsed customer's renewal are the same act on the same
 * row — and one screen means one set of copy to keep true.
 *
 * Three states, driven entirely by the stored status:
 *
 *   - entitled       → what they have, when it renews, and how to stop it
 *   - recoverable    → a payment problem, and the way out of it
 *   - nothing yet    → the offer
 */

/** What the subscription buys. Written for a solo coach, not for a changelog. */
const INCLUDED = [
  'A 12-week content strategy built from your offer, your audience and your voice',
  'Posts drafted in your voice, which you approve before anything is published',
  'Reporting on which posts produced clicks and conversations',
]

/**
 * A date in the user's own timezone. The renewal date is the single most
 * consequential number on this page — showing it in the server's timezone
 * could be a day out, on the one screen where being a day out looks like a
 * billing error.
 */
function formatInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date)
}

export default async function BillingPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // (app)/layout.tsx already redirects an unauthenticated request; this is the
  // same defensive re-check every page in this tree makes.
  if (!user) redirect('/login')

  const [profile, { entitled, subscription }] = await Promise.all([
    getProfile(user.id),
    loadEntitlement(user.id),
  ])

  const timeZone = profile?.timezone ?? 'UTC'
  const email = profile?.email ?? user.email ?? ''
  const described = subscription ? describeStatus(subscription.status) : null
  const renewsOn =
    subscription?.currentEnd ? formatInTimeZone(subscription.currentEnd, timeZone) : null

  // A user still at the paywall step has not had a strategy built yet, and
  // that is the thing the card unlocks. Saying so here is the difference
  // between a price and a reason.
  const isFirstPayment = profile?.onboardingStep === 'paywall'

  return (
    <div className="py-10">
      <h1 className="font-display text-3xl">Billing</h1>
      <p className="mt-2 text-[var(--color-text-muted)]">
        One plan, {PLAN_PRICE_LABEL}. No tiers, no usage limits, no add-ons.
      </p>

      {entitled && subscription ? (
        <section className="mt-10 rounded-lg border border-border bg-surface p-6">
          <h2 className="font-display text-xl">{described?.label}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{described?.detail}</p>

          <dl className="mt-6 flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="text-[var(--color-text-muted)]">Plan</dt>
              <dd>{PLAN_PRICE_LABEL}</dd>
            </div>
            {renewsOn && (
              <div className="flex flex-wrap items-baseline gap-x-3">
                <dt className="text-[var(--color-text-muted)]">
                  {subscription.cancelAtCycleEnd ? 'Access ends' : 'Next charge'}
                </dt>
                <dd>{renewsOn}</dd>
              </div>
            )}
          </dl>

          <div className="mt-6">
            {subscription.cancelAtCycleEnd ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                This subscription is set to end
                {renewsOn ? ` on ${renewsOn}` : ' at the end of this cycle'}. You keep full access
                until then, and nothing you have made is deleted.
              </p>
            ) : (
              <CancelSubscription
                accessEndsOn={renewsOn}
                cancelSubscription={cancelSubscription}
              />
            )}
          </div>
        </section>
      ) : (
        <section className="mt-10 rounded-lg border border-border bg-surface p-6">
          {/* A user who has been here before gets their status first: telling
              someone whose card just failed about the wonderful features would
              be answering a question they did not ask. */}
          {described && (
            <>
              <h2 className="font-display text-xl">{described.label}</h2>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{described.detail}</p>
              <hr className="my-6 border-border" />
            </>
          )}

          <h2 className="font-display text-xl">
            {described ? `Start again — ${PLAN_PRICE_LABEL}` : `${PLAN_PRICE_LABEL}`}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {isFirstPayment
              ? 'Your voice profile is saved. Subscribing builds your 12-week strategy straight away.'
              : 'Billed monthly. Cancel any time — you keep access until the cycle you have paid for ends.'}
          </p>

          <ul className="mt-6 flex flex-col gap-2 text-sm">
            {INCLUDED.map((item) => (
              <li key={item} className="text-[var(--color-text-muted)]">
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <StartSubscription
              email={email}
              label={`LinkBud — ${PLAN_PRICE_LABEL}`}
              startSubscription={startSubscription}
              confirmSubscription={confirmSubscription}
            />
          </div>
        </section>
      )}
    </div>
  )
}
