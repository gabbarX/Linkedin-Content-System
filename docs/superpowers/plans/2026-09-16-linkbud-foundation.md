# LinkBud Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a running, deployable LinkBud app — scaffold, design system, validated configuration, Supabase data layer with RLS, working auth, app shell, project documentation and Claude Code tooling — so every later milestone starts from a green build instead of an empty folder.

**Architecture:** A single Next.js 15 App Router application in TypeScript. Supabase provides Postgres, Auth and row-level security; the app talks to it through three explicit clients (browser, server-component, admin) so the service-role key can never leak into a client bundle. All configuration is parsed and validated once at startup through a single `env` module, so a missing key fails loudly at boot rather than silently at 2am in a cron worker. The design system is expressed as CSS custom properties consumed by Tailwind v4's `@theme`, giving one place to change the entire visual language.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, shadcn/ui, Supabase (`@supabase/ssr`), Zod, Vitest, Vercel.

**Spec:** [`docs/superpowers/specs/2026-09-16-linkbud-design.md`](../specs/2026-09-16-linkbud-design.md)

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Every publish is a user-initiated tap.** No unattended auto-publish, no "set and forget" mode, at any tier. (API ToS §3.1(26))
- **LinkBud never fetches a user's LinkedIn posts.** Voice is learned from user-pasted samples only. (`r_member_social` is closed)
- **Business context comes from the guided interview**, never the LinkedIn profile. Self-serve OIDC returns `sub`, name, email, picture only.
- **No Chrome extension, no session cookies, no headless browser.** A hard architectural boundary, not a trade-off to revisit. (User Agreement §8.2(2), §8.2(13))
- **LinkedIn-returned social content is purged within 48 hours.** Persist only our own generated content, post URNs and numeric metrics.
- **Web / installable PWA only.** No native app targets. (Apple App Store 5.1.1(v))
- **v1 is text-only.** No carousels, no image generation, no multi-image.
- **Two LinkedIn apps:** App A (Share on LinkedIn, self-serve), App B (clean, CMA application). CMA cannot be requested on an app holding Share on LinkedIn / OIDC.
- **RLS on every table**, keyed to `auth.uid()`. LinkedIn tokens encrypted at rest.
- **Single SKU: $49/month**, 14-day trial, card required after strategy delivery and before post generation.
- **Posting cadence is 3, 4 or 5 posts per week; default 3.** Daily posting is deliberately not offered.
- **TDD is mandatory** for: Stripe billing and trial state, the LinkedIn adapter and token refresh, the job engine (claiming, backoff, retry, idempotency), attribution, and the 48-hour purge job. Not required for UI components or prompt construction.
- **Hard gate before any commit:** `npm run verify` (typecheck + lint + test + build) must pass.
- **Design direction is calm editorial.** Banned: purple/indigo gradients, glassmorphism, neon on dark, emoji as UI iconography, more than one accent colour, decorative shadows.

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json` | Scripts, dependencies. `verify` is the quality gate. |
| `src/app/layout.tsx` | Root layout, fonts, theme class |
| `src/app/globals.css` | Design tokens and Tailwind v4 theme |
| `src/app/(marketing)/page.tsx` | Public landing placeholder |
| `src/app/(auth)/login/page.tsx` | Magic link + Google sign-in |
| `src/app/auth/callback/route.ts` | OAuth / magic-link code exchange |
| `src/app/(app)/layout.tsx` | Authenticated shell — nav, session guard |
| `src/app/(app)/dashboard/page.tsx` | Three-band dashboard skeleton |
| `src/lib/env.ts` | Parse and validate all configuration. Single source. |
| `src/lib/supabase/browser.ts` | Browser client (anon key) |
| `src/lib/supabase/server.ts` | Server component / route handler client |
| `src/lib/supabase/admin.ts` | Service-role client. Server-only. |
| `src/lib/types/database.ts` | Generated Supabase types |
| `src/components/ui/*` | shadcn primitives |
| `src/components/app-nav.tsx` | Authenticated navigation |
| `src/middleware.ts` | Session refresh on every request |
| `supabase/migrations/*.sql` | Schema and RLS, one file per change |
| `docs/CLAUDE.md` → `CLAUDE.md` | Working agreement for Claude |
| `docs/ARCHITECTURE.md` | Module map and interfaces |
| `docs/DESIGN-SYSTEM.md` | Tokens, components, banned patterns |
| `docs/LINKEDIN-COMPLIANCE.md` | The constraints, with sources |
| `docs/ACCOUNTS.md` | Milestone 0 checklist + CMA application text |
| `docs/ROADMAP.md` | Milestones 2–10 |
| `.claude/commands/*.md` | Project slash commands |
| `.claude/agents/*.md` | Project subagents |
| `.claude/settings.json` | Hooks and permissions |

---

## Task 1: Scaffold and the verify gate

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `npm run verify` — the command every later task ends with. Path alias `@/*` → `src/*`.

- [ ] **Step 1: Create the Next.js app in place**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
```

If the directory is non-empty, create into a temp dir and move the files in — do not delete `docs/` or `.git/`.

- [ ] **Step 2: Install the remaining dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr zod date-fns
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths
```

- [ ] **Step 3: Add the verify script**

In `package.json`, set `scripts` to:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "verify": "npm run typecheck && npm run lint && npm run test && npm run build"
}
```

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
```

- [ ] **Step 5: Enforce strict TypeScript**

In `tsconfig.json`, inside `compilerOptions`, ensure:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true
}
```

`noUncheckedIndexedAccess` is deliberate: array and record access returns `T | undefined`, which catches a whole class of bug that AI-written code produces often.

- [ ] **Step 6: Write `.env.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
SHORT_LINK_DOMAIN=http://localhost:3000

# LLM (Milestone 5)
OPENROUTER_API_KEY=

# Trends (Milestone 8)
EXA_API_KEY=

# LinkedIn App A — Share on LinkedIn (Milestone 6)
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback

# Encryption for stored LinkedIn tokens (Milestone 6)
# Generate with: openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=

# Stripe (Milestone 4)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

# Email (Milestone 6)
RESEND_API_KEY=

# Cron auth (Milestone 6)
CRON_SECRET=
```

- [ ] **Step 7: Confirm `.gitignore` covers secrets**

Ensure it contains `.env`, `.env.local`, `.env*.local`, `node_modules`, `.next`, `coverage`.

- [ ] **Step 8: Run the gate**

Run: `npm run verify`
Expected: all four stages pass. Fix anything red before continuing — this is the baseline every later task is measured against.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with verify gate"
```

---

## Task 2: Validated configuration

**Files:**
- Create: `src/lib/env.ts`
- Test: `src/lib/env.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `parseServerEnv(raw: Record<string, string | undefined>): ServerEnv` — pure, testable
  - `serverEnv: ServerEnv` — lazily parsed singleton for server code
  - `publicEnv: PublicEnv` — safe for client bundles
  - Types `ServerEnv`, `PublicEnv`

This task is TDD because it is cheap and because a config mistake surfaces as a confusing runtime failure inside a cron worker, which is the worst place to debug one.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseServerEnv } from './env'

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
}

describe('parseServerEnv', () => {
  it('returns a typed config when required vars are present', () => {
    const env = parseServerEnv(valid)
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-key')
  })

  it('names every missing variable in the error message', () => {
    expect(() => parseServerEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(() => parseServerEnv({})).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('rejects a non-URL Supabase URL', () => {
    expect(() =>
      parseServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('treats milestone keys as optional', () => {
    const env = parseServerEnv(valid)
    expect(env.OPENROUTER_API_KEY).toBeUndefined()
  })

  it('keeps optional keys when supplied', () => {
    const env = parseServerEnv({ ...valid, OPENROUTER_API_KEY: 'sk-or-1' })
    expect(env.OPENROUTER_API_KEY).toBe('sk-or-1')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/env.test.ts`
Expected: FAIL — `Failed to resolve import "./env"`.

- [ ] **Step 3: Implement**

Create `src/lib/env.ts`:

```ts
import { z } from 'zod'

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Added by later milestones. Optional until the milestone that needs them,
  // so the app boots throughout the build rather than only at the end.
  SHORT_LINK_DOMAIN: z.string().url().optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  EXA_API_KEY: z.string().min(1).optional(),
  LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
  LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),
  LINKEDIN_REDIRECT_URI: z.string().url().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_ID: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
})

export type ServerEnv = z.infer<typeof serverSchema>

export function parseServerEnv(
  raw: Record<string, string | undefined>,
): ServerEnv {
  const result = serverSchema.safeParse(raw)
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    )
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`)
  }
  return result.data
}

let cached: ServerEnv | undefined

/** Server-only configuration. Throws on first access if anything is missing. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}

/** Safe to reference from client components. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
} as const

export type PublicEnv = typeof publicEnv
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/env.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts src/lib/env.test.ts
git commit -m "feat: validated environment configuration"
```

---

## Task 3: Design system

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/components/ui/*` (via shadcn)

**Interfaces:**
- Consumes: nothing
- Produces: CSS custom properties `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-border`, `--color-accent`, `--color-accent-fg`, `--color-danger`; font variables `--font-sans`, `--font-display`; Tailwind utilities `bg-bg`, `text-muted`, `border-border`, `bg-accent`, `font-display`.

- [ ] **Step 1: Write the token layer**

Replace the contents of `src/app/globals.css`:

```css
@import "tailwindcss";

/* ---------------------------------------------------------------
   LinkBud — calm editorial.
   Warm off-white ground, near-black text, ONE restrained accent.
   Banned: gradients, glassmorphism, neon, decorative shadows,
   emoji as iconography, a second accent colour.
   --------------------------------------------------------------- */

:root {
  --color-bg: #faf8f4;
  --color-surface: #ffffff;
  --color-text: #1a1917;
  --color-muted: #6b6760;
  --color-border: #e7e2d8;
  --color-accent: #1f4b43;
  --color-accent-fg: #ffffff;
  --color-danger: #9b3626;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
}

:root[data-theme="dark"] {
  --color-bg: #171613;
  --color-surface: #201e1a;
  --color-text: #f2efe8;
  --color-muted: #a09a90;
  --color-border: #322e28;
  --color-accent: #6fae9d;
  --color-accent-fg: #14211d;
  --color-danger: #d4705c;
}

@theme inline {
  --color-bg: var(--color-bg);
  --color-surface: var(--color-surface);
  --color-text: var(--color-text);
  --color-muted: var(--color-muted);
  --color-border: var(--color-border);
  --color-accent: var(--color-accent);
  --color-accent-fg: var(--color-accent-fg);
  --color-danger: var(--color-danger);

  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-fraunces), ui-serif, Georgia, serif;

  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

/* Long-form reading is the core act in this product. */
.prose-post {
  max-width: 62ch;
  line-height: 1.65;
  white-space: pre-wrap;
}
```

- [ ] **Step 2: Wire the fonts**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' })

export const metadata: Metadata = {
  title: 'LinkBud',
  description:
    'Writes LinkedIn posts toward your actual offer, and shows you which ones booked calls.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Install shadcn primitives**

```bash
npx shadcn@latest init --yes
npx shadcn@latest add button input label textarea card dialog dropdown-menu sonner badge separator tabs
```

When init asks about colours, accept defaults — the tokens above govern, and Task 3 Step 4 reconciles the generated variables.

- [ ] **Step 4: Reconcile shadcn variables with the tokens**

shadcn writes its own `--background`, `--foreground`, `--primary` etc. into `globals.css`. Point them at ours rather than maintaining two palettes — add at the end of `globals.css`:

```css
@layer base {
  :root {
    --background: var(--color-bg);
    --foreground: var(--color-text);
    --card: var(--color-surface);
    --card-foreground: var(--color-text);
    --popover: var(--color-surface);
    --popover-foreground: var(--color-text);
    --primary: var(--color-accent);
    --primary-foreground: var(--color-accent-fg);
    --secondary: var(--color-surface);
    --secondary-foreground: var(--color-text);
    --muted: var(--color-surface);
    --muted-foreground: var(--color-muted);
    --accent: var(--color-surface);
    --accent-foreground: var(--color-text);
    --destructive: var(--color-danger);
    --border: var(--color-border);
    --input: var(--color-border);
    --ring: var(--color-accent);
    --radius: var(--radius-md);
  }
}
```

- [ ] **Step 5: Verify visually**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: warm off-white background, near-black text, no purple anywhere. If you see a gradient or a violet button, a token is not wired — fix before moving on.

- [ ] **Step 6: Run the gate and commit**

```bash
npm run verify
git add -A
git commit -m "feat: calm editorial design system"
```

---

## Task 4: Supabase clients and the profiles table

**Files:**
- Create: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
- Create: `supabase/migrations/0001_profiles.sql`

**Interfaces:**
- Consumes: `getServerEnv`, `publicEnv` from Task 2
- Produces:
  - `createBrowserClient(): SupabaseClient`
  - `createServerClient(): Promise<SupabaseClient>` — reads/writes the auth cookie
  - `createAdminClient(): SupabaseClient` — service role, **server-only**
  - Table `public.profiles` with columns `id uuid pk`, `email text`, `full_name text`, `timezone text`, `cadence_per_week int`, `preferred_post_time time`, `onboarding_step text`, `created_at`, `updated_at`

- [ ] **Step 1: Browser client**

Create `src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient as createClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'

export function createBrowserClient() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey)
}
```

- [ ] **Step 2: Server client**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient as createClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicEnv } from '@/lib/env'

export async function createServerClient() {
  const cookieStore = await cookies()

  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // middleware.ts refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}
```

- [ ] **Step 3: Admin client**

Create `src/lib/supabase/admin.ts`:

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { getServerEnv } from '@/lib/env'

/**
 * Service-role client. Bypasses RLS entirely.
 * Only for cron workers and webhooks, where there is no user session.
 * Never import this from a component.
 */
export function createAdminClient() {
  const env = getServerEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

```bash
npm install server-only
```

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/0001_profiles.sql`:

```sql
-- LinkBud profiles: one row per authenticated user.
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text not null,
  full_name           text,
  timezone            text not null default 'UTC',
  cadence_per_week    smallint not null default 3
                        check (cadence_per_week between 3 and 5),
  preferred_post_time time not null default '08:00',
  onboarding_step     text not null default 'interview'
                        check (onboarding_step in
                          ('interview','samples','voice','strategy','paywall','done')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Create the profile row automatically on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
```

Note the cadence check constraint enforces the spec's 3–5 rule at the database level, so no application bug can create a daily-posting user.

- [ ] **Step 5: Apply the migration**

Paste the file into the Supabase dashboard SQL editor and run it, or if the Supabase CLI is linked: `npx supabase db push`.

- [ ] **Step 6: Verify RLS is actually on**

In the Supabase SQL editor:

```sql
select relname, relrowsecurity
from pg_class
where relname = 'profiles';
```

Expected: `relrowsecurity` is `true`. If it is false, RLS is off and every user can read every row — stop and fix.

- [ ] **Step 7: Generate types**

```bash
npx supabase gen types typescript --project-id <your-project-ref> > src/lib/types/database.ts
```

- [ ] **Step 8: Run the gate and commit**

```bash
npm run verify
git add -A
git commit -m "feat: supabase clients and profiles table with RLS"
```

---

## Task 5: Authentication

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/auth/signout/route.ts`
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `createBrowserClient`, `createServerClient` (Task 4), `publicEnv` (Task 2)
- Produces: a signed-in session available to every route under `(app)`; `GET /auth/callback?code=...` exchanges a code for a session; `POST /auth/signout` clears it.

LinkedIn is deliberately **not** an auth provider here. See spec §3.1: a revoked LinkedIn grant must never lock a paying customer out of their own drafts.

- [ ] **Step 1: Session-refresh middleware**

Create `src/middleware.ts` (NOT the repo root — with a `src/` directory Next.js resolves middleware at `src/middleware.ts`, and a root file is silently ignored):

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Refreshes the auth token. Required — do not remove.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
}
```

- [ ] **Step 2: Login page**

Create `src/app/(auth)/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserClient } from '@/lib/supabase/browser'
import { publicEnv } from '@/lib/env'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${publicEnv.appUrl}/auth/callback` },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function signInWithGoogle() {
    setBusy(true)
    setError(null)
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${publicEnv.appUrl}/auth/callback` },
    })
    // On success the browser navigates away, so this only runs on failure.
    if (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-display text-3xl">Sign in to LinkBud</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        We&apos;ll email you a link. No password to remember.
      </p>

      {sent ? (
        <p className="mt-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          Check your inbox — the link is on its way to {email}.
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourdomain.com"
            />
          </div>
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a link'}
          </Button>
        </form>
      )}

      <div className="my-6 flex items-center gap-3 text-sm text-[var(--color-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        or
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <Button variant="outline" onClick={signInWithGoogle} className="w-full">
        Continue with Google
      </Button>
    </main>
  )
}
```

- [ ] **Step 3: Callback route**

Create `src/app/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

/**
 * `next` is attacker-controllable. Resolving it against our own origin and
 * comparing origins rejects `//evil.com`, `https://evil.com`, and the
 * `@evil.com` userinfo trick — which the WHATWG URL parser would otherwise
 * read as a host, sending the user to an attacker's site the moment they
 * finish signing in.
 */
export function safeNext(next: string | null, origin: string): string {
  if (!next) return '/dashboard'
  try {
    const parsed = new URL(next, origin)
    return parsed.origin === origin ? `${parsed.pathname}${parsed.search}` : '/dashboard'
  } catch {
    return '/dashboard'
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'), origin)

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

- [ ] **Step 4: Sign-out route**

Create `src/app/auth/signout/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
```

- [ ] **Step 5: Configure Supabase Auth**

In the Supabase dashboard → Authentication → URL Configuration, set Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to Redirect URLs. Enable the Google provider and paste in a Google OAuth client id and secret.

- [ ] **Step 6: Verify end to end**

Run `npm run dev`, go to `/login`, enter your email, click the emailed link.
Expected: you land on `/dashboard` with a session. Then check in the Supabase table editor that a `profiles` row was created automatically by the trigger — if not, the trigger from Task 4 did not apply.

- [ ] **Step 7: Run the gate and commit**

```bash
npm run verify
git add -A
git commit -m "feat: magic link and Google authentication"
```

---

## Task 6: App shell and dashboard skeleton

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`
- Create: `src/components/app-nav.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `createServerClient` (Task 4)
- Produces: the authenticated shell every later milestone's pages render inside; the three-band dashboard structure from spec §6.

- [ ] **Step 1: Navigation**

Create `src/components/app-nav.tsx`:

```tsx
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
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Authenticated layout**

Create `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
import { createServerClient } from '@/lib/supabase/server'

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

  return (
    <div className="min-h-screen">
      <AppNav email={user.email ?? ''} />
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Dashboard skeleton**

Create `src/app/(app)/dashboard/page.tsx`:

```tsx
function Band({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-12">
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">{hint}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-sm text-[var(--color-muted)]">
      {children}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <>
      <h1 className="font-display text-3xl">Today</h1>

      <div className="mt-10">
        <Band title="Needs you now" hint="Posts waiting for your approval.">
          <Empty>Nothing to approve yet. Finish onboarding to get your first week.</Empty>
        </Band>

        <Band
          title="What's happening in your world"
          hint="Fresh in your niche today, each one tap from a draft."
        >
          <Empty>Your radar starts once your strategy exists.</Empty>
        </Band>

        <Band title="What's working" hint="Clicks, conversations, and what LinkBud has learned.">
          <Empty>No published posts yet.</Empty>
        </Band>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Landing placeholder**

Replace `src/app/page.tsx`:

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <h1 className="font-display text-5xl leading-tight">
        LinkedIn posts that point at your offer.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-[var(--color-muted)]">
        LinkBud learns your business and your voice, plans twelve weeks of content,
        writes each post for you to approve — and tells you which ones booked calls.
      </p>
      <div className="mt-10">
        <Button asChild>
          <Link href="/login">Get started</Link>
        </Button>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Verify the guard**

Open `/dashboard` in a private window.
Expected: redirected to `/login`. Signed in: the three bands render.

- [ ] **Step 6: Run the gate and commit**

```bash
npm run verify
git add -A
git commit -m "feat: authenticated app shell and dashboard skeleton"
```

---

## Task 7: Project documentation

**Files:**
- Create: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN-SYSTEM.md`, `docs/LINKEDIN-COMPLIANCE.md`, `docs/ACCOUNTS.md`, `docs/ROADMAP.md`, `README.md`

**Interfaces:**
- Consumes: the spec
- Produces: the context Claude loads on every session. `CLAUDE.md` is the working agreement; the rest are referenced from it rather than inlined, to keep the always-loaded file short.

- [ ] **Step 1: Write `CLAUDE.md`**

It must contain, in this order: what LinkBud is in two sentences; the stack; the non-negotiable LinkedIn rules with a pointer to `docs/LINKEDIN-COMPLIANCE.md`; where things live; the `npm run verify` gate; when TDD is mandatory; the banned design patterns; and a short "ask before" list (schema changes, new dependencies, anything touching the publisher).

Keep it under 150 lines. A CLAUDE.md nobody reads to the end is a CLAUDE.md that does not work.

- [ ] **Step 2: Write `docs/LINKEDIN-COMPLIANCE.md`**

Reproduce the Global Constraints table with the source for each, plus a "things that look reasonable but are forbidden" list: scraping a public profile to speed up onboarding, a browser extension to read analytics, auto-publishing without a tap, storing LinkedIn post text beyond 48 hours, requesting CMA on the Share-on-LinkedIn app.

- [ ] **Step 3: Write `docs/ARCHITECTURE.md`**

The eight modules from spec §4, each with its purpose and interface signature, plus the module dependency direction: `writer` depends on `onboarding` and `strategy`; `publisher` depends on nothing above it; `jobs` depends on everything but is depended on by nothing.

- [ ] **Step 4: Write `docs/DESIGN-SYSTEM.md`**

The tokens from Task 3, the type scale, spacing rhythm, the component inventory, and the banned-pattern list with a one-line reason for each.

- [ ] **Step 5: Write `docs/ACCOUNTS.md`**

Milestone 0 as an ordered checklist: incorporate → domain → Google Workspace business email → LinkedIn Company Page → LinkedIn App A with Share on LinkedIn + Sign In with LinkedIn → LinkedIn App B (clean) with the CMA application → Stripe product at $49/mo with a 14-day trial → Resend domain verification → short-link domain → Vercel project and env vars.

Include the CMA application text pre-drafted, framed around LinkedIn's own named approved use cases (Executive Management, Employee Advocacy), and a warning that a rejection requires a brand-new app rather than a re-application.

- [ ] **Step 6: Write `docs/ROADMAP.md`**

Milestones 2–10 from spec §8, each with its scope in three or four bullets and a note that its own plan gets written when it starts.

- [ ] **Step 7: Write `README.md`**

What it is, how to run it locally, where the docs are, the `verify` gate.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: project documentation and working agreement"
```

---

## Task 8: Claude Code tooling

**Files:**
- Create: `.claude/settings.json`
- Create: `.claude/commands/feature.md`, `.claude/commands/verify.md`, `.claude/commands/spec-check.md`
- Create: `.claude/agents/linkbud-reviewer.md`

**Interfaces:**
- Consumes: `npm run verify` (Task 1), the docs (Task 7)
- Produces: `/feature`, `/verify`, `/spec-check` slash commands; a project reviewer subagent; a `Stop` hook that runs the gate.

- [ ] **Step 1: Hook the quality gate**

Create `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "npm run typecheck --silent"
          }
        ]
      }
    ]
  },
  "permissions": {
    "allow": [
      "Bash(npm run:*)",
      "Bash(npx vitest:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add:*)"
    ]
  }
}
```

The `Stop` hook runs typecheck rather than full `verify` — a full build on every turn is too slow to live with, and typecheck catches the great majority of what Claude gets wrong.

- [ ] **Step 2: `/verify` command**

Create `.claude/commands/verify.md`:

```markdown
---
description: Run the full quality gate and fix anything red
---

Run `npm run verify`. If any stage fails, fix the cause — never the symptom,
and never by loosening a type, disabling a lint rule, or skipping a test.
Re-run until all four stages pass, then report what you changed.
```

- [ ] **Step 3: `/spec-check` command**

Create `.claude/commands/spec-check.md`:

```markdown
---
description: Check the working tree against the spec and the LinkedIn constraints
---

Read `docs/superpowers/specs/2026-09-16-linkbud-design.md` and
`docs/LINKEDIN-COMPLIANCE.md`, then review `git diff` against them.

Report, as a short list:
1. Anything that violates a hard constraint — especially auto-publishing
   without a user tap, reading a member's LinkedIn posts, scraping, or
   storing LinkedIn-returned content beyond 48 hours.
2. Anything that contradicts a decision recorded in the spec.
3. Scope that has crept in from the "out of scope for v1" list.

Say "no violations" if there are none. Do not pad the list.
```

- [ ] **Step 4: `/feature` command**

Create `.claude/commands/feature.md`:

```markdown
---
description: Build a feature the LinkBud way
argument-hint: [what to build]
---

Build: $ARGUMENTS

Follow this order, and do not skip ahead:
1. Read `CLAUDE.md` and `docs/ARCHITECTURE.md`.
2. Say which module this belongs to. If it belongs to none, stop and say so.
3. Check it against `docs/LINKEDIN-COMPLIANCE.md`. If it violates a constraint,
   stop and say which one.
4. If it touches billing, the LinkedIn adapter, the job engine, attribution,
   or the purge job — write the failing test first.
5. Implement.
6. Run `npm run verify`.
7. Commit with a conventional-commit message.
```

- [ ] **Step 5: Reviewer subagent**

Create `.claude/agents/linkbud-reviewer.md`:

```markdown
---
name: linkbud-reviewer
description: Reviews LinkBud changes against the spec, the LinkedIn constraints, and the design system. Use after implementing any feature.
tools: Read, Grep, Glob, Bash
---

You review changes to LinkBud. Read `CLAUDE.md`,
`docs/LINKEDIN-COMPLIANCE.md` and `docs/DESIGN-SYSTEM.md` first.

Check, in priority order:

1. **Compliance** — any path that publishes without a user tap, fetches a
   member's LinkedIn posts, scrapes, or persists LinkedIn-returned content
   past 48 hours. These are blocking.
2. **Security** — the service-role client imported outside a worker or
   webhook; a table without RLS; a secret reaching a client bundle; an
   unencrypted LinkedIn token.
3. **Correctness** — a publish path without an idempotency key; unhandled
   token expiry; timezone maths done in the server's zone rather than the
   user's.
4. **Design** — gradients, glassmorphism, a second accent colour, emoji as
   iconography, hardcoded hex instead of a token.
5. **Structure** — a file doing more than one job; logic above the
   `LinkedInAdapter` interface that knows which adapter is live.

Report findings most severe first, each with a file:line and a concrete fix.
If you find nothing, say so — do not invent findings to seem useful.
```

- [ ] **Step 6: Verify the tooling loads**

Run `/verify` in Claude Code.
Expected: it runs the gate. If the command is not found, the file is in the wrong place — it must be `.claude/commands/verify.md` relative to the repo root.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: Claude Code commands, reviewer agent and quality hook"
```

---

## Definition of done

- [ ] `npm run verify` passes from a clean clone after `npm install`
- [ ] A new user can sign in with a magic link and reach `/dashboard`
- [ ] A `profiles` row is created automatically on signup, with RLS confirmed on
- [ ] `/dashboard` is unreachable signed out
- [ ] No purple, no gradient, no glassmorphism anywhere in the UI
- [ ] `CLAUDE.md` and the five `docs/` files exist and are accurate
- [ ] `/verify`, `/spec-check`, `/feature` and the reviewer agent all work
- [ ] Deployed to Vercel with environment variables set, and the deployed login flow works

---

## Self-review notes

**Spec coverage.** This plan implements spec §3 (stack), §5 (the `profiles` slice of the data model), §6.1 (design direction) and §7 (quality gates), and sets up §8 Milestone 1. Spec §4's eight modules are deliberately *documented* here (Task 7) and *built* in Milestones 2–9 — `docs/ROADMAP.md` carries them. Spec §2's constraints are encoded three times over: in `CLAUDE.md`, in `docs/LINKEDIN-COMPLIANCE.md`, and in the reviewer agent's blocking checks. Spec §4.5's `LinkedInAdapter` is not created in this milestone because no code calls it yet; it lands in Milestone 6 alongside its first implementation and its tests.

**Known sequencing risk.** Task 4 Step 7 (type generation) and Task 5 Step 5 (auth configuration) need a live Supabase project, and Task 8's `/verify` check needs Claude Code running in this repo. If the Supabase project does not exist yet, do Task 1–3 first and come back — the plan is ordered so the first three tasks need no external accounts at all.
