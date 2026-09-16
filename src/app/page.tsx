import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <h1 className="font-display text-5xl leading-tight">
        LinkedIn posts that point at your offer.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-[var(--color-text-muted)]">
        LinkBud learns your business and your voice, plans twelve weeks of content,
        writes each post for you to approve — and tells you which ones booked calls.
      </p>
      <div className="mt-10">
        <Button nativeButton={false} render={<Link href="/login" />}>
          Get started
        </Button>
      </div>
    </main>
  )
}
