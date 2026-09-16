/**
 * Seeds a confirmed account with a password, so there is a way into the app
 * that does not depend on email delivery.
 *
 *   npm run seed:dev -- you@yourdomain.com
 *   npm run seed:dev -- you@yourdomain.com 'your-chosen-password'
 *   SEED_DEV_PASSWORD='…' npm run seed:dev -- you@yourdomain.com
 *
 * With no password given, one is generated and printed once. Prefer the
 * environment variable to the argument: a password passed on the command line
 * is visible in your shell history and to anything reading the process list.
 *
 * The address is an argument rather than a constant on purpose: a personal
 * email does not belong in a committed repository, and the right address
 * differs per developer and per environment.
 *
 * Idempotent. An existing account keeps its id, its profile and all its
 * onboarding data — only the password is reset.
 *
 * Creating the auth user is all this does. The `handle_new_user` trigger
 * writes the matching `public.profiles` row, and onboarding data comes from
 * using the app, because seeding a fake interview would mean testing against
 * answers no real user would give.
 */
import { randomBytes } from 'node:crypto'
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
    'Usage: npm run seed:dev -- you@yourdomain.com [password]\n\n' +
      'Pass the address you want to sign in as. Supabase rejects domains that\n' +
      'cannot take delivery, so it must be a real one even though password\n' +
      'sign-in does not send mail.',
  )
  process.exit(1)
}

/** base64url of 18 random bytes: 24 characters, no shell-hostile punctuation. */
function generatePassword() {
  return randomBytes(18).toString('base64url')
}

const provided = process.argv[3] ?? process.env.SEED_DEV_PASSWORD
const password = provided ?? generatePassword()

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

/** listUsers paginates; this walks it rather than assuming one page. */
async function findUserByEmail(address) {
  const wanted = address.toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const match = data.users.find((u) => u.email?.toLowerCase() === wanted)
    if (match) return match
    if (data.users.length < 200) return null
  }
  return null
}

// email_confirm skips the confirmation round trip, so the account is usable
// immediately rather than waiting on an email nobody sent.
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})

let userId = created?.user?.id ?? null
let existed = false

if (createError) {
  if (createError.code !== 'email_exists') {
    console.error(`Could not create ${email}: ${createError.message}`)
    process.exit(1)
  }
  existed = true
  const user = await findUserByEmail(email)
  if (!user) {
    console.error(
      `Supabase says ${email} exists but it was not found in the user list. ` +
        'Check the address for a typo.',
    )
    process.exit(1)
  }
  userId = user.id
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  })
  if (updateError) {
    console.error(`Could not set the password for ${email}: ${updateError.message}`)
    process.exit(1)
  }
}

console.log(
  existed
    ? `${email} already existed — password reset, account and data untouched (id ${userId}).`
    : `Created ${email} (id ${userId}).`,
)

if (!provided) {
  console.log(`\n  Password: ${password}\n`)
  console.log('Shown once. Nothing stores it in plain text, here or anywhere.')
}

console.log(`\nSign in at /login with that address and password.`)
