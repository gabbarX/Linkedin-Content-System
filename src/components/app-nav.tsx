import Link from 'next/link'

const links = [
  { href: '/dashboard', label: 'Today' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/strategy', label: 'Strategy' },
  { href: '/settings', label: 'Settings' },
]

/**
 * The authenticated navigation.
 *
 * Wraps rather than overflows: Milestone 3's browser QA found the single
 * `h-14` row pushed the account name and Sign out past the viewport on a
 * phone, so every authenticated page scrolled horizontally by ~250px. The
 * links row and the account row may now break onto two lines, the height
 * is a minimum rather than fixed, and the account name is hidden below
 * `sm` — Sign out is the control that matters there, and the name is
 * visible again on any wider screen.
 */
export function AppNav({ displayName }: { displayName: string }) {
  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 sm:gap-x-8 sm:py-0">
        <Link href="/dashboard" className="font-display text-lg">
          LinkBud
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:gap-x-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden max-w-[16rem] truncate text-sm text-[var(--color-text-muted)] sm:inline">
            {displayName}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
