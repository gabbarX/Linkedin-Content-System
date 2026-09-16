import { defineConfig, env } from 'prisma/config'

// Prisma 7 no longer loads .env implicitly. Node's built-in loader does it
// without adding a dotenv dependency. Both files are optional: CI and Vercel
// provide these as real environment variables instead.
for (const file of ['.env', '.env.local']) {
  try {
    process.loadEnvFile(file)
  } catch {
    // absent or unreadable - fall through to the real environment
  }
}

/**
 * Prisma 7 reads datasource configuration from this file rather than from
 * `--schema` flags.
 *
 * The CLI (migrate, db execute, db pull) gets DIRECT_URL — port 5432, a real
 * session. Pointing CLI operations at the pooled URL fails, because Supavisor's
 * transaction mode does not support the session state DDL and introspection
 * need.
 *
 * Runtime is separate: PrismaClient is constructed with DATABASE_URL (the
 * pooled connection, port 6543, pgbouncer=true) in src/server/db/client.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
})
