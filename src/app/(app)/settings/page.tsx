import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

/**
 * The `/settings` index (Task 10, Ruling R12).
 *
 * `src/components/app-nav.tsx` has linked here since Milestone 1; the link
 * 404'd until now (`docs/BACKLOG.md`), deliberately -- the nav reflects the
 * real information architecture from spec §6, not placeholders invented to
 * fill it in early. This page lists exactly the sections that exist today
 * (one: the business profile), not a settings surface for the rest of the
 * product. Milestone 8 owns everything else that eventually lives here.
 */

const SECTIONS = [
  {
    href: '/settings/business',
    title: 'Business profile',
    description: 'The offer, audience and voice inputs every draft is built from.',
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
