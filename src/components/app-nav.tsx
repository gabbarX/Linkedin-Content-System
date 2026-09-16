import Link from 'next/link'

const links = [
  { href: '/dashboard', label: 'Today' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/strategy', label: 'Strategy' },
  { href: '/settings', label: 'Settings' },
]

export function AppNav({ email }: { email: string }) {
  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-8 px-6">
        <Link href="/dashboard" className="font-display text-lg">
          LinkBud
        </Link>
        <nav className="flex flex-1 items-center gap-6 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--color-muted)]">{email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
