import 'server-only'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getServerEnv } from '@/lib/env.server'

/**
 * The Prisma client.
 *
 * READ THIS BEFORE IMPORTING IT ANYWHERE.
 *
 * Prisma connects as the `postgres` role, which has BYPASSRLS. Row-level
 * security does not constrain these queries — verified against the live
 * database, where `postgres` and `service_role` have rolbypassrls = true while
 * `anon` and `authenticated` do not.
 *
 * That means **this client sees every row of every user**. Ownership is
 * enforced in application code, by the repositories in ./repositories, where
 * every function takes an explicit userId. An ESLint rule (see
 * eslint.config.mjs, `no-restricted-imports`) blocks importing this module
 * outside src/server/db, so a route cannot reach the raw client by accident.
 *
 * If you are here because you want to query something: add a repository
 * function, do not import this.
 *
 * Connection: DATABASE_URL is the Supavisor transaction pooler (port 6543,
 * pgbouncer=true). Serverless functions open and close connections constantly,
 * and the pooler is what stops that exhausting the database. Migrations use
 * DIRECT_URL instead — see prisma.config.ts.
 */

function createClient(): PrismaClient {
  const env = getServerEnv()
  if (!env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Prisma cannot connect. See docs/ACCOUNTS.md.',
    )
  }

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  })
}

// Next.js discards module state on hot reload in development, which would open
// a new pool on every edit until the database refuses connections. Stashing the
// client on globalThis keeps exactly one.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let client: PrismaClient | undefined

/**
 * Construction is deferred to the first query, and this is not a style
 * preference — it is the same invariant CLAUDE.md states for `getServerEnv()`:
 * **the app must build and prerender with no credentials present.** Building a
 * client at module scope would read the environment during `next build`'s page
 * data collection, the moment anything under src/app imports a repository, and
 * a fresh clone's build would fail. Milestone 1 already shipped one bug of
 * exactly this shape.
 */
export function getPrisma(): PrismaClient {
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma ??= createClient()
    return globalForPrisma.prisma
  }
  client ??= createClient()
  return client
}
