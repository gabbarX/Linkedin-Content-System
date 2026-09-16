# LinkBud

**The only LinkedIn tool that writes toward your actual offer, and shows you which posts booked calls.**

LinkBud is a LinkedIn content system for solo B2B coaches and consultants. It learns your business, offer and writing voice; produces a 12-week content strategy; drafts posts in your voice against current trends in your niche; you approve each post and LinkBud publishes it; and it reports which posts produced clicks and conversations.

Every publish is a tap you make. There is no unattended auto-posting, no browser extension, and no scraping — see [`docs/LINKEDIN-COMPLIANCE.md`](docs/LINKEDIN-COMPLIANCE.md) for why that is a permanent architectural boundary and not a feature gap.

---

## Status

The foundation is built: Next.js 16 App Router, TypeScript strict, Tailwind v4 with the design system, Supabase clients and a `profiles` table with row-level security, magic-link and Google sign-in, the authenticated shell, and the three-band dashboard skeleton.

The product modules — onboarding, strategy, writer, publisher, attribution — are not built yet. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Running it locally

You need **Node 20.9 or newer** (what `next@16` requires) and npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

**It builds and runs with no credentials at all.** `npm run verify` passes on a clean
checkout, and the public pages render: the landing page at `/` and the sign-in form at
`/login`. The session-refresh proxy detects the missing credentials and steps aside
rather than constructing a Supabase client it cannot construct.

What requires credentials is **signing in**. With no Supabase project configured, asking
for a magic link or pressing "Continue with Google" fails immediately with a message
naming the environment variable that is missing — it does not silently do nothing.

## What you need in `.env.local` before sign-in works

Copy the template and fill in the Supabase values:

```bash
cp .env.example .env.local
```

The four that matter for local development:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Everything else in `.env.example` is optional until the milestone that needs it — the configuration validator in `src/lib/env.ts` only requires the four above, so the app boots throughout the build rather than only at the end.

**There is no live Supabase project yet.** Creating one, applying `supabase/migrations/0001_profiles.sql`, confirming RLS is on, and configuring Google sign-in are steps 7 through 12 of [`docs/ACCOUNTS.md`](docs/ACCOUNTS.md). Work through that document in order; it has the exact dashboard paths and the check that tells you each step worked.

`.env.local` is gitignored. Never commit a key. The `service_role` key bypasses row-level security entirely — it belongs on the server and nowhere else.

## The gate

```bash
npm run verify
```

That runs `typecheck` → `lint` → `test` → `build`, in that order, and **it must pass before any commit**. Not "usually". If it fails, fix the cause rather than silencing the check — a disabled lint rule outlives the afternoon that disabled it.

Individual steps, when you want a faster loop:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest run
npm run test:watch   # vitest, watching
npm run build        # next build
```

## Documentation

| Document | What it is for |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | The working agreement. Read first — it is what Claude Code loads every session. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The eight modules, their interfaces, and what depends on what |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | Tokens, type scale, component inventory, banned patterns |
| [`docs/LINKEDIN-COMPLIANCE.md`](docs/LINKEDIN-COMPLIANCE.md) | The hard constraints, with their sources, and the tempting things that are forbidden |
| [`docs/ACCOUNTS.md`](docs/ACCOUNTS.md) | Milestone 0 — every account to open, in order, with the CMA application text |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones 2–10 and what is blocked on LinkedIn approval |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Deferred items from the foundation, each with the trigger that ends the deferral |
| [`docs/superpowers/specs/2026-09-16-linkbud-design.md`](docs/superpowers/specs/2026-09-16-linkbud-design.md) | The approved product spec. Binding authority for everything above. |

## Layout

```
src/
  app/
    (app)/            authenticated routes — the session guard lives in this layout
    (auth)/login/     magic link + Google sign-in
    auth/             callback and signout route handlers
    globals.css       design tokens
  components/ui/      shadcn primitives (Base UI, not Radix)
  lib/
    env.ts            the only place process.env is read
    supabase/         browser, server and admin clients
  proxy.ts            session refresh (not route protection)
supabase/migrations/  schema and RLS, one file per change
```
