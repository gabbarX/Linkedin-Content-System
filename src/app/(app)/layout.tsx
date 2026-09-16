import { redirect } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
import { createServerClient } from '@/lib/supabase/server'
import { getProfile } from '@/server/db/repositories/profiles'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Supabase Auth owns identity; the profiles row owns everything the product
  // knows about the person. Scoped to user.id because Prisma bypasses RLS —
  // see src/server/db/client.ts.
  const profile = await getProfile(user.id)

  // A signed-in user with no profiles row means handle_new_user() did not fire.
  // The page still renders — locking someone out of their own account over a
  // missing display name would be worse — but this is the only place that
  // failure is observable, so it does not pass silently.
  if (!profile) {
    console.error(
      'LinkBud: authenticated user has no profiles row; the handle_new_user() trigger did not fire',
      user.id,
    )
  }

  return (
    <div className="min-h-screen">
      <AppNav displayName={profile?.fullName ?? user.email ?? 'Your account'} />
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  )
}
