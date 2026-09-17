import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

/**
 * The `/settings` index (Task 10, Ruling R12).
 *
 * `src/components/app-nav.tsx` has linked here since Milestone 1; the link
 * 404'd until now (`docs/BACKLOG.md`), deliberately -- the nav reflects the
 * real information architecture from spec §6, not placeholders invented to
 * fill it in early. This page lists exactly the sections that exist today
 * (the business profile, and billing since Milestone 4), not a settings
 * surface for the rest of the product. Milestone 8 owns everything else that
 * eventually lives here.
 *
 * Billing links out to `/billing` rather than duplicating it at
 * `/settings/billing`: the paywall a new user meets and the management screen
 * a paying customer opens are one page, so there is one set of copy to keep
 * true. It also has to stay reachable from here, because a lapsed customer is
 * redirected out of the product and `/settings` is one of the few places they
 * can still get to.
 */

const SECTIONS = [
  {
    href: '/settings/business',
    title: 'Business profile',
    description: 'The offer, audience and voice inputs every draft is built from.',
  },
  {
    href: '/billing',
    title: 'Billing',
    description: 'Your subscription, the next charge date, and how to cancel.',
  },
]

export default function SettingsPage() {
  return (
    <div className="py-10">
      <h1 className="font-display text-3xl">Settings</h1>
      <p className="mt-2 text-[var(--color-text-muted)]">
        Everything you can change about how LinkBud works for you.
      </p>

      <div className="mt-10 flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-6 transition-colors hover:border-brand/50"
          >
            <div>
              <h2 className="font-display text-xl">{section.title}</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{section.description}</p>
            </div>
            <ChevronRight aria-hidden="true" className="shrink-0 text-[var(--color-text-muted)]" />
          </Link>
        ))}
      </div>
    </div>
  )
}
