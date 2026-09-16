/**
 * Seeds a confirmed user so a fresh environment has an account to sign in as.
 *
 *   npm run seed:dev -- you@yourdomain.com
 *
 * The address is an argument rather than a constant on purpose: a personal
 * email does not belong in a committed repository, and the right address
 * differs per developer and per environment.
 *
 * It must be an address that can actually receive mail. Supabase rejects
 * non-deliverable domains outright -- `dev@linkbud.example` was refused with
 * "Email address is invalid" -- and sign-in is by emailed link, so an address
 * nobody can read is an account nobody can use.
 *
 * Creating the auth user is all this does. The `handle_new_user` trigger writes
 * the matching `public.profiles` row, and onboarding data comes from using the
 * app, because seeding a fake interview would mean testing against answers no
 * real user would give.
 *
 * Idempotent: run it as often as you like. An existing account is reported and
 * left exactly as it is.
 */
import { createClient } from '@supabase/supabase-js'

for (const file of ['.env', '.env.local']) {
  try {
    process.loadEnvFile(file)
  } catch {
    // absent or unreadable - fall through to the real environment
  }
}

const email = process.argv[2]

if (!email) {
  console.error(
    'Usage: npm run seed:dev -- you@yourdomain.com\n\n' +
      'Pass the address you want to sign in as. It must be able to receive\n' +
      'mail: sign-in is by emailed link, and Supabase rejects domains that\n' +
      'cannot take delivery.',
  )
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See docs/ACCOUNTS.md.',
  )
  process.exit(1)
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// email_confirm skips the confirmation round trip, so the account is usable
// immediately rather than waiting on an email nobody sent.
const { data, error } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
})

if (error && error.code !== 'email_exists') {
  console.error(`Could not create ${email}: ${error.message}`)
  process.exit(1)
}

if (error?.code === 'email_exists') {
  console.log(`${email} already exists — nothing to do.`)
} else {
  console.log(`Created ${email} (id ${data.user?.id}).`)
}

console.log(
  '\nSign in at /login with that address. The link Supabase emails will land\n' +
    'on /auth/confirm, which verifies it without needing the browser that\n' +
    'requested it — so opening the email on your phone works.',
)
