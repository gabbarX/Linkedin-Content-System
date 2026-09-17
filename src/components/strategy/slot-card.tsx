import Link from 'next/link'
import type { Slot } from '@/server/db/repositories/strategies'
import { Button } from '@/components/ui/button'
import { formatIsoDate } from '@/lib/strategy/schedule'
import { FORMAT_META } from '@/lib/strategy/vocabulary'

/**
 * One dated slot, as both planning surfaces render it (spec §4.2: date,
 * pillar, theme, angle, format, one-line brief). A Server Component -- no
 * state, no handlers -- so it takes plain data and the pillar's name rather
 * than looking anything up.
 *
 * The full brief (hook, key points, proof, CTA) exists only once the
 * slot's week has been briefed. `/strategy` shows it open, because that
 * page is about this week; `/calendar` collapses it behind a native
 * `<details>`, because that page is about the shape of twelve weeks and
 * forty briefs open at once would bury it. Native `<details>` keeps this a
 * Server Component and is keyboard- and screen-reader-accessible for free.
 *
 * `writeHref` is optional and is a plain `<Link>` rather than a button with a
 * handler, deliberately: a client control here would make this a Client
 * Component and cost every calendar page forty hydration boundaries. Each
 * surface decides for itself whether to offer it, and only a briefed slot can
 * be written, so an unbriefed week correctly shows nothing rather than a link
 * that would refuse.
 */
export type SlotCardProps = {
  slot: Slot
  pillarName: string
  briefLayout: 'open' | 'collapsed'
  /** Where "write this post" goes. Omitted on surfaces that do not offer it. */
  writeHref?: string
  /** True when a draft already exists, so the link says so. */
  hasDraft?: boolean
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-4xl border border-border px-2 text-xs font-medium text-text-muted">
      {children}
    </span>
  )
}

function FullBrief({ slot }: { slot: Slot }) {
  return (
    <dl className="grid gap-3 text-sm">
      <div>
        <dt className="text-xs font-medium tracking-wide text-text-muted uppercase">Hook</dt>
        <dd className="mt-1">{slot.hook}</dd>
      </div>
      {slot.keyPoints.length > 0 && (
        <div>
          <dt className="text-xs font-medium tracking-wide text-text-muted uppercase">Key points</dt>
          <dd className="mt-1">
            <ol className="list-decimal space-y-1 pl-5">
              {slot.keyPoints.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ol>
          </dd>
        </div>
      )}
      <div>
        <dt className="text-xs font-medium tracking-wide text-text-muted uppercase">Proof to lean on</dt>
        <dd className="mt-1">{slot.proofPoint ?? 'None from the profile fits this post -- do not invent any.'}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium tracking-wide text-text-muted uppercase">Call to action</dt>
        <dd className="mt-1">{slot.cta}</dd>
      </div>
    </dl>
  )
}

export function SlotCard({
  slot,
  pillarName,
  briefLayout,
  writeHref,
  hasDraft = false,
}: SlotCardProps) {
  const isBriefed = slot.status === 'briefed'
  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <time dateTime={slot.scheduledOn} className="text-sm font-medium">
          {formatIsoDate(slot.scheduledOn, { weekday: true })}
        </time>
        <Chip>{pillarName}</Chip>
        <Chip>{FORMAT_META[slot.format].label}</Chip>
        {isBriefed && (
          <span className="text-xs font-medium text-brand">Briefed</span>
        )}
      </div>

      <h3 className="mt-3 text-base font-medium">{slot.theme}</h3>
      <p className="mt-1 text-sm">{slot.angle}</p>
      <p className="mt-2 text-sm text-text-muted">{slot.brief}</p>

      {isBriefed && briefLayout === 'open' && (
        <div className="mt-4 border-t border-border pt-4">
          <FullBrief slot={slot} />
        </div>
      )}

      {isBriefed && briefLayout === 'collapsed' && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-text-muted select-none hover:text-text">
            Full brief
          </summary>
          <div className="mt-3">
            <FullBrief slot={slot} />
          </div>
        </details>
      )}

      {isBriefed && writeHref !== undefined && (
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={writeHref} />}
          >
            {hasDraft ? 'Keep editing' : 'Write this post'}
          </Button>
        </div>
      )}
    </article>
  )
}
