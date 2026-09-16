import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BriefWeekButton } from '@/components/strategy/brief-week-button'
import { RegenerateStrategy } from '@/components/strategy/regenerate-strategy'
import { SlotCard } from '@/components/strategy/slot-card'
import { StrategyBuilder } from '@/components/strategy/strategy-builder'
import { Button } from '@/components/ui/button'
import {
  firstMondayAfter,
  formatIsoDate,
  todayInTimeZone,
  upcomingWeekIndex,
  weekBounds,
} from '@/lib/strategy/schedule'
import { ARC_PHASES, PHASE_META, phaseForWeek } from '@/lib/strategy/vocabulary'
import { createServerClient } from '@/lib/supabase/server'
import { getProfile } from '@/server/db/repositories/profiles'
import { getStrategy } from '@/server/db/repositories/strategies'
import { briefUpcomingWeek, buildStrategy } from '@/server/strategy/actions'

/** Ruling R-M3-11: Regenerate and the brief-week retry are model calls
 * invoked from this page; without this the platform default cuts them off. */
export const maxDuration = 300

/**
 * The Strategy page (Task 7, spec §6): a planning surface one click from
 * the dashboard, not the front door. Positioning, pillars, the four-phase
 * arc, and this week's slots with their full briefs.
 *
 * Lives under `(app)/(onboarded)/` so the onboarding guard applies
 * (Ruling R-M3-10); a `strategy`-step user never reaches it, they are sent
 * to `/onboarding/strategy` to build one first. A `paywall`/`done` user
 * with no strategy row -- a state no normal path produces -- gets the
 * builder inline rather than a dead end.
 */
export default async function StrategyPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profile, strategy] = await Promise.all([getProfile(user.id), getStrategy(user.id)])
  if (!profile) redirect('/login')

  const today = todayInTimeZone(profile.timezone)

  if (!strategy) {
    return (
      <div className="mx-auto max-w-2xl">
        <StrategyBuilder
          variant="empty"
          cadence={profile.cadencePerWeek}
          startsOnLabel={formatIsoDate(firstMondayAfter(today), { weekday: true, year: true })}
          buildStrategy={buildStrategy}
        />
      </div>
    )
  }

  const pillarName = new Map(strategy.pillars.map((pillar) => [pillar.id, pillar.name]))
  const weekIndex = upcomingWeekIndex(strategy.startsOn, today)
  const weekSlots = weekIndex === null ? [] : strategy.slots.filter((slot) => slot.weekIndex === weekIndex)
  const weekIsBriefed = weekSlots.length > 0 && weekSlots.every((slot) => slot.status === 'briefed')
  const currentPhase = weekIndex === null ? null : phaseForWeek(weekIndex)
  const lastWeek = weekBounds(strategy.startsOn, 12)

  return (
    <>
      <p className="text-sm text-text-muted">
        Your 12-week strategy · {strategy.cadencePerWeek} posts a week ·{' '}
        {formatIsoDate(strategy.startsOn)} to {formatIsoDate(lastWeek.to, { year: true })} · version{' '}
        {strategy.version}
      </p>
      <h1 className="mt-2 font-display text-3xl">Your strategy</h1>
      <p className="mt-4 max-w-2xl text-lg text-text-muted">{strategy.positioning}</p>

      <section className="mt-12">
        <h2 className="font-display text-xl">Pillars</h2>
        <p className="mt-1 text-sm text-text-muted">
          The themes every post proves something about. Each one points at your offer.
        </p>
        <ol className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {strategy.pillars.map((pillar) => (
            <li key={pillar.id} className="rounded-lg border border-border bg-surface p-6">
              <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
                Pillar {pillar.position}
              </span>
              <h3 className="mt-1 font-display text-xl">{pillar.name}</h3>
              <p className="mt-2 text-sm text-text-muted">{pillar.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl">The arc</h2>
        <p className="mt-1 text-sm text-text-muted">
          Twelve weeks in four movements. Readers are earned before they are asked.
        </p>
        <ol className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          {ARC_PHASES.map((phase) => {
            const [first, last] = PHASE_META[phase].weeks
            const isCurrent = phase === currentPhase
            return (
              <li
                key={phase}
                className={`rounded-lg border bg-surface p-5 ${isCurrent ? 'border-brand' : 'border-border'}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
                  Weeks {first}–{last}
                  {isCurrent ? ' · now' : ''}
                </span>
                <h3 className="mt-1 font-medium">{PHASE_META[phase].label}</h3>
                <p className="mt-2 text-sm text-text-muted">{strategy.phases[phase]}</p>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="mt-12">
        {weekIndex === null ? (
          <>
            <h2 className="font-display text-xl">Your twelve weeks are complete</h2>
            <p className="mt-1 text-sm text-text-muted">
              The plan ran from {formatIsoDate(strategy.startsOn)} to {formatIsoDate(lastWeek.to)}.
              Regenerate below to plan the next twelve.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl">
              Week {weekIndex} · {strategy.weekThemes[weekIndex - 1]}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {formatIsoDate(weekBounds(strategy.startsOn, weekIndex).from, { weekday: true })} to{' '}
              {formatIsoDate(weekBounds(strategy.startsOn, weekIndex).to, { weekday: true })} ·{' '}
              {PHASE_META[phaseForWeek(weekIndex)].label} phase.{' '}
              {weekIsBriefed
                ? 'Briefed in full -- every post below is ready to be written.'
                : 'Laid out; the full briefs come next.'}
            </p>
            <div className="mt-4 grid gap-4">
              {!weekIsBriefed && (
                <BriefWeekButton weekIndex={weekIndex} briefUpcomingWeek={briefUpcomingWeek} />
              )}
              {weekSlots.map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  pillarName={pillarName.get(slot.pillarId) ?? 'Pillar'}
                  briefLayout="open"
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-8">
        <Button nativeButton={false} render={<Link href="/calendar" />}>
          See all twelve weeks
        </Button>
        <RegenerateStrategy version={strategy.version} buildStrategy={buildStrategy} />
      </section>
    </>
  )
}
