import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SlotCard } from '@/components/strategy/slot-card'
import { Button } from '@/components/ui/button'
import { formatIsoDate, todayInTimeZone, upcomingWeekIndex, weekBounds } from '@/lib/strategy/schedule'
import { ARC_PHASES, PHASE_META, weeksForPhase } from '@/lib/strategy/vocabulary'
import { createServerClient } from '@/lib/supabase/server'
import { getProfile } from '@/server/db/repositories/profiles'
import { getStrategy } from '@/server/db/repositories/strategies'

/**
 * The Calendar (Task 8, spec §6): the 12-week board, one click from the
 * dashboard. Every dated slot at the chosen cadence, grouped by phase and
 * week, with the current week marked. A planning surface opened weekly;
 * the dashboard is the daily habit.
 *
 * It is a list by week rather than a month grid on purpose: this is a
 * content plan, not a diary. What the reader wants to see is the shape of
 * the twelve weeks -- which pillar, which format, which angle, where the
 * arc turns -- and a month grid would give each post a 40-pixel cell.
 */
export default async function CalendarPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profile, strategy] = await Promise.all([getProfile(user.id), getStrategy(user.id)])
  if (!profile) redirect('/login')

  if (!strategy) {
    return (
      <>
        <h1 className="font-display text-3xl">Calendar</h1>
        <div className="mt-10 rounded-lg border border-dashed border-border p-8 text-sm text-text-muted">
          <p>Your calendar fills in once your 12-week strategy exists.</p>
          <div className="mt-4">
            <Button nativeButton={false} render={<Link href="/strategy" />}>
              Build your strategy
            </Button>
          </div>
        </div>
      </>
    )
  }

  const today = todayInTimeZone(profile.timezone)
  const currentWeek = upcomingWeekIndex(strategy.startsOn, today)
  const pillarName = new Map(strategy.pillars.map((pillar) => [pillar.id, pillar.name]))
  const lastWeek = weekBounds(strategy.startsOn, 12)

  return (
    <>
      <p className="text-sm text-text-muted">
        {strategy.slots.length} posts · {strategy.cadencePerWeek} a week ·{' '}
        {formatIsoDate(strategy.startsOn, { weekday: true })} to{' '}
        {formatIsoDate(lastWeek.to, { weekday: true, year: true })}
      </p>
      <h1 className="mt-2 font-display text-3xl">Calendar</h1>
      <p className="mt-2 text-text-muted">
        Every slot in your twelve weeks. Only the current week carries full briefs; later weeks stay
        open, so what you learn can steer them.
      </p>

      {ARC_PHASES.map((phase) => (
        <section key={phase} className="mt-12">
          <h2 className="font-display text-xl">{PHASE_META[phase].label}</h2>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">{strategy.phases[phase]}</p>

          <div className="mt-6 flex flex-col gap-8">
            {weeksForPhase(phase).map((weekIndex) => {
              const bounds = weekBounds(strategy.startsOn, weekIndex)
              const isCurrent = weekIndex === currentWeek
              const slots = strategy.slots.filter((slot) => slot.weekIndex === weekIndex)
              return (
                <section
                  key={weekIndex}
                  id={`week-${weekIndex}`}
                  aria-current={isCurrent ? 'date' : undefined}
                  className={`border-l-2 pl-5 ${isCurrent ? 'border-brand' : 'border-border'}`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-medium">
                      Week {weekIndex}
                      {isCurrent && <span className="ml-2 text-xs font-medium text-brand">This week</span>}
                    </h3>
                    <span className="text-sm text-text-muted">
                      {formatIsoDate(bounds.from)} – {formatIsoDate(bounds.to)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{strategy.weekThemes[weekIndex - 1]}</p>
                  <div className="mt-4 grid gap-3">
                    {slots.map((slot) => (
                      <SlotCard
                        key={slot.id}
                        slot={slot}
                        pillarName={pillarName.get(slot.pillarId) ?? 'Pillar'}
                        briefLayout="collapsed"
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </section>
      ))}

      <div className="mt-12 border-t border-border pt-8">
        <Button variant="outline" nativeButton={false} render={<Link href="/strategy" />}>
          Back to the strategy
        </Button>
      </div>
    </>
  )
}
