# LinkBud Milestone 4 — Razorpay paywall — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A solo coach who has finished the interview, pasted samples and reviewed their Voice Profile must start a ₹1,499/month Razorpay subscription before LinkBud will generate their 12-week strategy, and must keep it live to reach the product.

**Architecture:** Razorpay Subscriptions over plain `fetch` (HTTP Basic auth) with `node:crypto` for both HMAC-SHA256 signature checks — no SDK. A `subscriptions` table mirrors Razorpay's eight states; entitlement is *derived* from the live status on every request and never cached as a boolean. Three independent paths write that status: the checkout confirm action (signature-verified, then re-fetched from Razorpay), the webhook (signature-verified, ordering-guarded), and an explicit cancel. The gate is enforced structurally — protected pages live in the `(onboarded)` route group, `/billing` and `/settings` live outside it, so a locked-out user can always reach the page that unlocks them and a redirect loop is impossible rather than avoided.

**Tech Stack:** Next.js 16.3.5 App Router · TypeScript strict · Prisma 7.10 on Supabase Postgres · Zod 4 · Vitest (node) · Razorpay Subscriptions API · Base UI / shadcn (Nova) · Tailwind v4

**Spec:** `docs/superpowers/specs/2026-09-16-linkbud-design.md` — §1.2 (pricing and gate position), §3 (billing row + the 2026-09-17 amendment), §5 (`subscriptions`, and why its RLS differs), §7 (TDD scope).

## Global Constraints

- **The gate:** `npm run verify` (typecheck && lint && test && build) must pass before **every** commit. Never `LINKBUD_SKIP_GATE=1`. Never weaken a lint rule, add `// @ts-expect-error`, or set `ignoreBuildErrors`.
- **No `any`. No non-null `!`. No `as` used to silence the compiler.** `allowed.some(o => o === v)` narrows without a cast; `(allowed as readonly string[]).includes(v)` is banned.
- **A validation boundary must be complete or it is not a boundary.** Where a guard applies to a set of things, iterate a *derived* list (`SUBSCRIPTION_STATUSES`, `PAGE_ROUTE_BY_STEP`) so the next value added is safe by construction. Server actions are public HTTP endpoints; a disabled button constrains a cooperative browser, not a crafted POST.
- **Every repository function takes `userId` first and scopes on it.** Prisma connects as `postgres` (BYPASSRLS); a missing scope is a cross-customer leak, not a bug. This includes the webhook path — see Task 5.
- **No new npm dependencies.** Razorpay is `fetch` + `node:crypto`. Razorpay Checkout is a `<script>` tag loaded on demand, not a package.
- **`getServerEnv()` / `getPublicEnv()` are only ever called inside function bodies**, never at module scope — the app must keep building with no credentials present.
- **Price:** ₹1,499/month = `149900` paise, INR, monthly. Plan `plan_TcyWDCJsx4fnbQ` (verified live 2026-09-17: monthly, interval 1, amount 149900, item "Premium", active).
- **Env var names, as they already exist in `.env`:** `RAZORPAY_KEY`, `RAZORPAY_SECRET`, `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET`. Not `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`.
- **`RAZORPAY_KEY` must never become a `NEXT_PUBLIC_` variable.** Checkout needs it in the browser; it is returned by a server action instead, so it reaches only a signed-in user who has asked to pay.
- **Design system:** `docs/DESIGN-SYSTEM.md`. One accent (`--lb-accent`). No gradients, glassmorphism, neon, emoji-as-icon (use Lucide), decorative shadows, or hard-coded hex/`oklch()` in components.
- **`Button` is Base UI-backed and has no `asChild`.** Render a link with `<Button render={<Link href="/billing" />}>…</Button>`.
- **Currency in the UI is always rendered from `src/lib/billing/plan.ts`.** Never type the rupee figure into a component.

---

## File structure

| File | Responsibility | Client-safe? |
|---|---|---|
| `src/lib/env.public.ts` | The three `NEXT_PUBLIC_*` values, validated. | yes |
| `src/lib/env.server.ts` | Server-only schema, `getServerEnv`, `parseServerEnv`. | no |
| `src/lib/billing/plan.ts` | The price: paise, currency, display string. | yes |
| `src/lib/billing/subscription.ts` | Razorpay's eight statuses, `isEntitled`, `isSubscriptionStatus`, and the human label per status. Domain vocabulary, so it lives in `lib` and must never import `server-only` — the `/billing` client component reads it. Same reasoning as `steps.ts` (Ruling R9). | yes |
| `src/server/billing/signatures.ts` | Both HMAC-SHA256 checks, timing-safe. Nothing else. | no |
| `src/server/billing/razorpay-client.ts` | `createRazorpayClient({ keyId, keySecret, fetchImpl })` → `{ createSubscription, fetchSubscription, cancelAtCycleEnd }`. Zod-parses every response. A factory, so tests inject a fake `fetch`. | no |
| `src/server/billing/webhook-events.ts` | Pure: a parsed webhook body → `{ userId, subscriptionId, patch }` or `null`. No I/O, no crypto. | no |
| `src/server/billing/entitlement.ts` | `loadEntitlement(userId)` / `requireEntitled(userId)` — the one gate helper the layout, the strategy page and the strategy actions all call. | no |
| `src/server/billing/actions.ts` | `startSubscription`, `confirmSubscription`, `cancelSubscription`. Each re-derives the user from the session. | no |
| `src/server/db/repositories/subscriptions.ts` | All subscription data access, `userId`-first. | no |
| `src/app/api/razorpay/webhook/route.ts` | Raw body → verify → map → apply. | no |
| `src/app/(app)/billing/page.tsx` | The paywall and the management screen — one page, three states. Outside `(onboarded)`. | no |
| `src/components/billing/start-subscription.tsx` | Loads Checkout on demand, opens it, confirms server-side. | yes |
| `src/components/billing/cancel-subscription.tsx` | Confirm dialog → `cancelSubscription()`. | yes |
| `supabase/migrations/0005_billing.sql` | `subscriptions`, select-only RLS, cascade delete, `paywall → done` data migration. | — |

**Deleted:** `src/lib/env.ts` (split; every import site updated).

**Why one `/billing` page and not a separate `/onboarding/paywall`.** They would render the same three states from the same row. `PAGE_ROUTE_BY_STEP.paywall` points at `/billing`, so the wizard and the lapsed-customer path land on one screen with one set of copy to keep true.

---

### Task 1: Split the env module and swap Stripe's keys for Razorpay's

Clears both `docs/BACKLOG.md` items Milestone 4 owns, before anything reads the new keys.

**Files:**
- Create: `src/lib/env.public.ts`, `src/lib/env.server.ts`, `src/lib/env.public.test.ts`, `src/lib/env.server.test.ts`
- Delete: `src/lib/env.ts`, `src/lib/env.test.ts`
- Modify: every import site of `@/lib/env` (found in Step 1), `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: `getServerEnv(): ServerEnv`, `parseServerEnv(raw)` from `@/lib/env.server`, with new optional keys `RAZORPAY_KEY`, `RAZORPAY_SECRET`, `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET` (each `z.string().min(1).optional()`); `publicEnv`, `getPublicEnv()`, `parsePublicEnv(raw)` from `@/lib/env.public`.

- [ ] **Step 1: Find every import site**

Run: `grep -rn "@/lib/env" src/ scripts/ --include=*.ts --include=*.tsx`

Each file imports either public values or server values, never both — that is what makes the split safe.

- [ ] **Step 2: Create `src/lib/env.public.ts`**

Move `publicEnv`, `publicSchema`, `ValidatedPublicEnv`, `parsePublicEnv`, `getPublicEnv`, `cachedPublic` across verbatim, plus a **copy** of `withoutBlanks`. Keep every doc comment — especially the one saying each `NEXT_PUBLIC_*` key must be read as a literal member expression because Next only inlines that form. Change `z.string().url()` → `z.url()`.

The duplicated `withoutBlanks` is deliberate: it is eight lines, and a shared module imported by both halves would be a path for a server import to creep back into the client-safe file.

- [ ] **Step 3: Create `src/lib/env.server.ts`**

Move `serverSchema`, `ServerEnv`, `parseServerEnv`, `getServerEnv`, `cached`, `withoutBlanks` across verbatim, including the long `withoutBlanks` comment about blank values. Then: `z.string().url()` → `z.url()` everywhere; delete `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`; add:

```ts
  // Razorpay (Milestone 4). Optional like every other later-milestone key, so
  // the app boots and builds without them.
  //
  // The names match the Razorpay dashboard's own wording rather than being
  // tidied into KEY_ID/KEY_SECRET here: the value is copied from that screen
  // into .env by hand, and a rename is one more chance to paste the wrong one.
  //
  // RAZORPAY_KEY is safe to show a browser -- Checkout needs it -- but is
  // deliberately NOT a NEXT_PUBLIC_ variable. A server action hands it to a
  // signed-in user who has asked to pay, rather than baking it into the bundle
  // every anonymous visitor downloads.
  RAZORPAY_KEY: z.string().min(1).optional(),
  RAZORPAY_SECRET: z.string().min(1).optional(),
  RAZORPAY_PLAN_ID: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
```

The three `NEXT_PUBLIC_*` keys stay in the server schema as well — server code reads them and must still validate them.

- [ ] **Step 4: Split the test file and add the new cases**

Move each existing test into the matching new file. Add to `src/lib/env.server.test.ts`:

```ts
const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
}

describe('parseServerEnv, Razorpay keys', () => {
  it('parses with no Razorpay key set', () => {
    expect(parseServerEnv(valid).RAZORPAY_KEY).toBeUndefined()
  })

  it('reads a blank Razorpay key as unset rather than invalid', () => {
    const env = parseServerEnv({ ...valid, RAZORPAY_KEY: '', RAZORPAY_PLAN_ID: '' })
    expect(env.RAZORPAY_KEY).toBeUndefined()
    expect(env.RAZORPAY_PLAN_ID).toBeUndefined()
  })

  it('keeps all four Razorpay values when set', () => {
    const env = parseServerEnv({
      ...valid,
      RAZORPAY_KEY: 'rzp_test_x',
      RAZORPAY_SECRET: 'secret',
      RAZORPAY_PLAN_ID: 'plan_x',
      RAZORPAY_WEBHOOK_SECRET: 'whsec',
    })
    expect(env.RAZORPAY_KEY).toBe('rzp_test_x')
    expect(env.RAZORPAY_SECRET).toBe('secret')
    expect(env.RAZORPAY_PLAN_ID).toBe('plan_x')
    expect(env.RAZORPAY_WEBHOOK_SECRET).toBe('whsec')
  })

  it('names the offending variable when a URL is malformed', () => {
    expect(() => parseServerEnv({ ...valid, NEXT_PUBLIC_APP_URL: 'not-a-url' }))
      .toThrow(/NEXT_PUBLIC_APP_URL/)
  })
})
```

- [ ] **Step 5: Delete the old module and fix every import site**

Run: `rm src/lib/env.ts src/lib/env.test.ts`

Then update each file from Step 1. `src/lib/supabase/browser.ts` takes `@/lib/env.public`; `src/lib/supabase/server.ts`, `admin.ts`, `src/server/db/client.ts`, `src/server/llm/client.ts` take `@/lib/env.server`.

- [ ] **Step 6: Update `.env.example`** — replace the three `STRIPE_*` lines with the four `RAZORPAY_*` lines, each blank.

- [ ] **Step 7: Run the gate**

Run: `npm run verify`
Expected: all four stages pass. A typecheck failure means an import site was missed — that is what this step is for.

- [ ] **Step 8: Commit**

```
refactor(env): split env into public and server, swap Stripe keys for Razorpay
```

Body: both BACKLOG items cleared; a file needing a public value can no longer see the name of a secret, which is the point — Stripe's key names had no business in a module a client component imports. `z.string().url()` → `z.url()`, deprecated in zod 4. `RAZORPAY_KEY` deliberately not `NEXT_PUBLIC_`.

---

### Task 2: Migration 0005 — the `subscriptions` table

**Files:**
- Create: `supabase/migrations/0005_billing.sql`
- Modify: `prisma/schema.prisma` (by introspection, not by hand)

**Interfaces:**
- Consumes: nothing.
- Produces: a Prisma model `subscriptions` with columns `id, user_id, razorpay_subscription_id, razorpay_plan_id, razorpay_customer_id, status, current_start, current_end, charge_at, cancel_at_cycle_end, ended_at, last_event_at, created_at, updated_at`.

- [ ] **Step 1: Write the migration**

Follow `0004_strategy.sql`'s conventions exactly — read it first. The file:

```sql
-- LinkBud Milestone 4: billing.
--
-- One table, `subscriptions`, from spec §5. Conventions follow 0003 and 0004,
-- with ONE deliberate and important difference, explained under "Row level
-- security" below: this table gets a SELECT policy and nothing else.
--
-- No foreign key to auth.users, for the reason recorded in 0002. user_id holds
-- auth.users.id and rows are cleaned up by the cascade trigger at the end.
--
-- Nothing here comes from LinkedIn, so the 48-hour purge rule does not apply.

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
-- One per user (spec §1.1: one solo coach, one profile), so `unique` on
-- user_id is the correct constraint. A user who cancels and later resubscribes
-- gets a NEW Razorpay subscription id written onto the SAME row -- Razorpay
-- cannot restart a cancelled subscription, and we do not keep a history of
-- past ones because nothing in v1 reads it (spec §1.2: no proration, no
-- ledger). If billing history is ever needed, Razorpay's dashboard is the
-- system of record for it.
--
-- `status` mirrors Razorpay's own eight subscription states exactly, and the
-- check constraint below is the list. Keep it in step with
-- SUBSCRIPTION_STATUSES in src/lib/billing/subscription.ts. We store Razorpay's
-- vocabulary rather than a LinkBud one: a translation layer here would mean
-- every webhook needed a mapping that could silently fall through, and an
-- unmapped state would read as "no subscription" -- which fails open, into
-- free access.
--
-- Entitlement is NOT a column. It is derived from `status` on every request
-- (src/lib/billing/subscription.ts). A cached boolean is one missed webhook
-- away from being a lie, in the direction that gives the product away.
--
-- `last_event_at` is the ordering guard. Razorpay retries webhooks and does
-- not guarantee delivery order, so a stale `subscription.pending` arriving
-- after `subscription.active` would lock out a paying customer. Writes from
-- the webhook path carry the event's own timestamp and are applied only when
-- it is at least as new as this column, in the UPDATE's WHERE clause -- so the
-- check is atomic rather than read-then-write.
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique,
  razorpay_subscription_id text not null unique,
  razorpay_plan_id         text not null,
  -- Razorpay populates the customer only once the authorisation transaction
  -- completes, so this is null between `created` and `authenticated`.
  razorpay_customer_id     text,
  status                   text not null
                             check (status in ('created','authenticated','active',
                                               'pending','halted','cancelled',
                                               'completed','expired')),
  -- The current billing cycle. Null until the first charge; Razorpay returns
  -- these as unix seconds and the repository converts.
  current_start            timestamptz,
  current_end              timestamptz,
  charge_at                timestamptz,
  cancel_at_cycle_end      boolean not null default false,
  ended_at                 timestamptz,
  last_event_at            timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE ADDING A POLICY HERE.
--
-- Every other table in this schema carries four policies scoped to
-- `authenticated`: select, insert, update and delete, each keyed to
-- (select auth.uid()) = user_id. This table carries SELECT ONLY, and the three
-- missing policies are the mechanism, not an oversight.
--
-- The anon key ships in the browser bundle and Supabase's Data API is reachable
-- with it. An insert or update policy here -- however correctly scoped to the
-- caller's own row -- would let anyone who views source write
-- status = 'active' onto their own subscription and use the product for free.
-- There is no such thing as a safely self-writable entitlement row.
--
-- Writes happen only through Prisma, which connects as a BYPASSRLS role, from
-- src/server/db/repositories/subscriptions.ts. A user may read their own
-- billing state and may not write it.
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No insert, update or delete policy. See the comment above.

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
-- public.touch_updated_at() already exists from 0001. Attach it; do not
-- redefine it.
drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Cascade delete
-- ---------------------------------------------------------------------------
-- Same shape as 0004: the whole function is redefined so the teardown order is
-- visible in one place. subscriptions is deleted first; profiles stays last.
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.subscriptions     where user_id = old.id;
  delete from public.slots             where user_id = old.id;
  delete from public.pillars           where user_id = old.id;
  delete from public.strategies        where user_id = old.id;
  delete from public.writing_samples   where user_id = old.id;
  delete from public.voice_profiles    where user_id = old.id;
  delete from public.business_profiles where user_id = old.id;
  delete from public.profiles          where id = old.id;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Data migration: onboarding_step 'paywall' changes meaning
-- ---------------------------------------------------------------------------
-- The gate moved ahead of the strategy (spec §1.2, amended 2026-09-17), so the
-- step order is now interview → samples → voice → paywall → strategy → done.
--
-- Under the OLD order, `paywall` was the step a user reached by FINISHING the
-- strategy -- it meant "everything built, billing not shipped yet". Under the
-- new order the same value means "has not paid", which is a different and much
-- earlier place. Every existing row at 'paywall' therefore has a strategy and
-- has finished onboarding, so 'done' is what it actually is.
--
-- These users have not paid, and this statement does not pretend otherwise:
-- entitlement is decided by the subscriptions table on every request, not by
-- onboarding_step. A 'done' user with no subscription row is still sent to
-- /billing by the guard. This only stops them being walked back through a
-- strategy build they already completed.
update public.profiles
   set onboarding_step = 'done'
 where onboarding_step = 'paywall';
```

- [ ] **Step 2: Check `handle_deleted_user()` against 0003 and 0004 before running it**

Run: `grep -n "delete from public" supabase/migrations/0003_onboarding.sql supabase/migrations/0004_strategy.sql`

The `create or replace` above replaces the whole function body, so every table from earlier migrations must still be listed. If 0003/0004 name a table the SQL above omits, add it — a dropped line here silently orphans rows on account deletion.

- [ ] **Step 3: STOP — this is a schema change. Show the human the migration and wait.**

`CLAUDE.md`: schema changes are a stop-and-ask, and an applied migration cannot be edited. Present the file, name the two unusual decisions (select-only RLS; the `paywall → done` data statement), and wait for an explicit go-ahead before applying.

- [ ] **Step 4: Apply it**

Apply through the Supabase SQL editor (same route as 0003 and 0004).

- [ ] **Step 5: Verify it live, and record what you saw**

```sql
select relrowsecurity, relforcerowsecurity from pg_class where relname = 'subscriptions';
select policyname, cmd, roles from pg_policies where tablename = 'subscriptions';
select count(*) from public.profiles where onboarding_step = 'paywall';
```

Expected: `t | t`; exactly one policy, `SELECT`, `{authenticated}`; and zero rows still at `paywall`. Then prove the check constraint bites:

```sql
insert into public.subscriptions (user_id, razorpay_subscription_id, razorpay_plan_id, status)
values (gen_random_uuid(), 'sub_test_constraint', 'plan_x', 'nonsense');
```

Expected: `23514` check constraint violation. Then insert with `'active'`, confirm it succeeds, and delete the row.

- [ ] **Step 6: Introspect, do not hand-write, the Prisma model**

Run: `npx prisma db pull && npx prisma generate`
Expected: `prisma/schema.prisma` gains a `subscriptions` model. Confirm `git diff prisma/schema.prisma` shows only that addition — if introspection rewrote an unrelated model, stop and work out why.

- [ ] **Step 7: Run the gate** — `npm run verify`

- [ ] **Step 8: Commit**

```
feat(db): add the subscriptions table, select-only under RLS
```

Body must record: why SELECT-only (a self-writable entitlement row is a free subscription for anyone reading the browser bundle); why entitlement is derived not stored; what `last_event_at` guards; and what the `paywall → done` statement means and why it is correct.

---

### Task 3: The billing vocabulary — price and statuses

Pure, client-safe, fully tested. Everything downstream reads its vocabulary from here.

**Files:**
- Create: `src/lib/billing/plan.ts`, `src/lib/billing/subscription.ts`, `src/lib/billing/subscription.test.ts`
- Test: `src/lib/billing/subscription.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PLAN_AMOUNT_PAISE: 149900`, `PLAN_CURRENCY: 'INR'`, `PLAN_PERIOD: 'monthly'`, `formatPlanPrice(): string`, `PLAN_PRICE_LABEL: string` from `@/lib/billing/plan`
  - `SUBSCRIPTION_STATUSES: readonly [...8]`, `type SubscriptionStatus`, `isSubscriptionStatus(v: unknown): v is SubscriptionStatus`, `isEntitled(status: SubscriptionStatus | null): boolean`, `describeStatus(status: SubscriptionStatus): { label: string; detail: string; tone: 'good' | 'warn' | 'ended' }` from `@/lib/billing/subscription`

- [ ] **Step 1: Write `src/lib/billing/plan.ts`**

```ts
/**
 * The single SKU (spec §1.2): ₹1,499/month, no trial.
 *
 * Client-safe on purpose -- the paywall screen renders the price and must not
 * pull a server module in to do it. Nothing here reads the environment: the
 * amount is a product decision, not configuration, and the Razorpay plan is
 * the thing that has to agree with it. RAZORPAY_PLAN_ID
 * (plan_TcyWDCJsx4fnbQ) is configured at 149900 paise monthly; if that ever
 * changes, change it in both places in the same commit.
 *
 * Razorpay works in the currency's smallest unit, so the amount is paise.
 * The formatter exists so no component ever types the figure itself -- one
 * place to change, and no chance of the button and the receipt disagreeing.
 */
export const PLAN_AMOUNT_PAISE = 149_900
export const PLAN_CURRENCY = 'INR'
export const PLAN_PERIOD = 'monthly'

/**
 * Total billing cycles requested when the subscription is created. Razorpay
 * requires `total_count` and has no "until cancelled" option, so this is the
 * longest reasonable horizon: 120 monthly cycles is ten years, after which the
 * subscription reaches `completed` on its own. A renewal at that point is a
 * problem worth having.
 */
export const PLAN_TOTAL_COUNT = 120

/** "₹1,499" -- no decimals, because the price has none. */
export function formatPlanPrice(): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: PLAN_CURRENCY,
    maximumFractionDigits: 0,
  }).format(PLAN_AMOUNT_PAISE / 100)
}

/** "₹1,499/month" -- the phrase used on the paywall and in settings. */
export const PLAN_PRICE_LABEL = `${formatPlanPrice()}/month`
```

- [ ] **Step 2: Write the failing test for the status vocabulary**

`src/lib/billing/subscription.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  SUBSCRIPTION_STATUSES,
  describeStatus,
  isEntitled,
  isSubscriptionStatus,
  type SubscriptionStatus,
} from './subscription'

describe('SUBSCRIPTION_STATUSES', () => {
  it("is exactly Razorpay's eight states", () => {
    expect([...SUBSCRIPTION_STATUSES]).toEqual([
      'created',
      'authenticated',
      'active',
      'pending',
      'halted',
      'cancelled',
      'completed',
      'expired',
    ])
  })
})

describe('isEntitled', () => {
  // Written as a table over the full status list rather than two assertions,
  // so adding a ninth status to SUBSCRIPTION_STATUSES without deciding what it
  // means for access fails this test instead of silently defaulting.
  const ENTITLEMENT: Record<SubscriptionStatus, boolean> = {
    created: false,
    authenticated: true,
    active: true,
    pending: false,
    halted: false,
    cancelled: false,
    completed: false,
    expired: false,
  }

  it('covers every status in SUBSCRIPTION_STATUSES', () => {
    expect(Object.keys(ENTITLEMENT).sort()).toEqual([...SUBSCRIPTION_STATUSES].sort())
  })

  for (const status of SUBSCRIPTION_STATUSES) {
    it(`${status} -> ${ENTITLEMENT[status] ? 'entitled' : 'not entitled'}`, () => {
      expect(isEntitled(status)).toBe(ENTITLEMENT[status])
    })
  }

  it('treats no subscription at all as not entitled', () => {
    expect(isEntitled(null)).toBe(false)
  })
})

describe('isSubscriptionStatus', () => {
  for (const status of SUBSCRIPTION_STATUSES) {
    it(`accepts ${status}`, () => {
      expect(isSubscriptionStatus(status)).toBe(true)
    })
  }

  it.each([['trialing'], ['ACTIVE'], [''], ['paused']])('rejects %s', (value) => {
    expect(isSubscriptionStatus(value)).toBe(false)
  })

  it.each([[null], [undefined], [42], [{}], [['active']]])('rejects non-strings', (value) => {
    expect(isSubscriptionStatus(value)).toBe(false)
  })
})

describe('describeStatus', () => {
  it('has copy for every status, with no placeholder text', () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      const described = describeStatus(status)
      expect(described.label.length).toBeGreaterThan(0)
      expect(described.detail.length).toBeGreaterThan(0)
      expect(described.label).not.toMatch(/TODO|TBD/i)
    }
  })

  it('marks the two entitled states as good and the failure states as warn', () => {
    expect(describeStatus('active').tone).toBe('good')
    expect(describeStatus('authenticated').tone).toBe('good')
    expect(describeStatus('halted').tone).toBe('warn')
    expect(describeStatus('pending').tone).toBe('warn')
    expect(describeStatus('cancelled').tone).toBe('ended')
  })
})
```

- [ ] **Step 3: Run it — it must fail**

Run: `npx vitest run src/lib/billing/subscription.test.ts`
Expected: FAIL, "Failed to resolve import ./subscription".

- [ ] **Step 4: Write `src/lib/billing/subscription.ts`**

```ts
/**
 * Razorpay's subscription state vocabulary, and what LinkBud does with it.
 *
 * Client-safe, and it must stay that way: `/billing` renders these labels from
 * a Client Component, and a `server-only` import anywhere in that dependency
 * chain fails the build with an error pointing at the wrong file. Same
 * reasoning as `src/lib/onboarding/steps.ts` (Ruling R9). Import nothing from
 * `@/server/**` here.
 *
 * The eight values are Razorpay's own, not a LinkBud translation, and must stay
 * in step with the check constraint in supabase/migrations/0005_billing.sql.
 * Storing the provider's vocabulary means there is no mapping layer that can
 * silently fall through -- and an unmapped state would read as "no
 * subscription", which fails open into free access.
 */
export const SUBSCRIPTION_STATUSES = [
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'cancelled',
  'completed',
  'expired',
] as const

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/**
 * The states that grant access to the product.
 *
 * `active` is the steady state. `authenticated` counts too: the mandate is
 * signed and the authorisation transaction has gone through, and the flip to
 * `active` happens when Razorpay starts the billing cycle. Making someone who
 * has just paid wait on a webhook before they can use what they paid for is a
 * support ticket, not a safeguard.
 *
 * Everything else is deliberately out, including `cancelled`: a cancellation
 * scheduled for the end of the cycle leaves the subscription `active` until
 * that moment, so a row that has actually reached `cancelled` is over.
 *
 * `satisfies` rather than a type annotation so the array keeps its literal
 * tuple type AND is checked against SubscriptionStatus -- a typo here is a
 * compile error, not a silently never-matching string.
 */
const ENTITLED_STATUSES = ['authenticated', 'active'] as const satisfies readonly SubscriptionStatus[]

/** Whether a user with this status may use the product. `null` means no subscription row. */
export function isEntitled(status: SubscriptionStatus | null): boolean {
  return status !== null && ENTITLED_STATUSES.some((entitled) => entitled === status)
}

/**
 * Narrow an unknown value -- a database column, a webhook payload -- to a
 * status.
 *
 * `.some(s => s === value)` rather than `(SUBSCRIPTION_STATUSES as readonly
 * string[]).includes(value)`: the cast version asserts the fact instead of
 * earning it, and CLAUDE.md bans it for the same reason it bans `!`.
 */
export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === 'string' && SUBSCRIPTION_STATUSES.some((status) => status === value)
}

export type StatusDescription = {
  /** Shown as the heading on /billing. */
  label: string
  /** One sentence saying what it means and what, if anything, to do. */
  detail: string
  tone: 'good' | 'warn' | 'ended'
}

/**
 * What to tell the user, per status.
 *
 * An exhaustive switch with no `default` branch, deliberately: adding a status
 * to SUBSCRIPTION_STATUSES without writing its copy is then a compile error
 * rather than an empty panel on a paying customer's billing page.
 */
export function describeStatus(status: SubscriptionStatus): StatusDescription {
  switch (status) {
    case 'created':
      return {
        label: 'Not started yet',
        detail: 'Your subscription was set up but the payment was never completed. Starting again is safe.',
        tone: 'warn',
      }
    case 'authenticated':
      return {
        label: 'Starting',
        detail: 'Your payment method is authorised and the first billing cycle is about to begin.',
        tone: 'good',
      }
    case 'active':
      return { label: 'Active', detail: 'Everything is running. Your next charge is below.', tone: 'good' }
    case 'pending':
      return {
        label: 'Payment failed',
        detail: 'A charge did not go through and Razorpay is retrying. Check the card or mandate on your bank side.',
        tone: 'warn',
      }
    case 'halted':
      return {
        label: 'Payment stopped',
        detail: 'Every retry failed, so billing has stopped. Start a new subscription to pick up where you left off.',
        tone: 'warn',
      }
    case 'cancelled':
      return {
        label: 'Cancelled',
        detail: 'This subscription has ended. Your strategy and profiles are untouched -- subscribe again to use them.',
        tone: 'ended',
      }
    case 'completed':
      return {
        label: 'Completed',
        detail: 'This subscription reached the end of its term. Start a new one to continue.',
        tone: 'ended',
      }
    case 'expired':
      return {
        label: 'Expired',
        detail: 'The payment was not authorised in time, so this subscription lapsed before it began.',
        tone: 'ended',
      }
  }
}
```

- [ ] **Step 5: Run the tests — they pass**

Run: `npx vitest run src/lib/billing/subscription.test.ts`
Expected: PASS, and the per-status cases should show 8 entitlement assertions and 8 narrowing assertions.

- [ ] **Step 6: Run the gate** — `npm run verify`

- [ ] **Step 7: Commit**

```
feat(billing): add the plan constants and Razorpay's status vocabulary
```

---

### Task 4: Signature verification

Both HMAC checks, timing-safe, tested against tampering. This is the security boundary of the whole milestone.

**Files:**
- Create: `src/server/billing/signatures.ts`, `src/server/billing/signatures.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `checkoutSignatureIsValid(input: { paymentId: string; subscriptionId: string; signature: string; keySecret: string }): boolean`
  - `webhookSignatureIsValid(input: { rawBody: string; signature: string; webhookSecret: string }): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { checkoutSignatureIsValid, webhookSignatureIsValid } from './signatures'

const KEY_SECRET = 'test_key_secret'
const WEBHOOK_SECRET = 'test_webhook_secret'

function sign(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('hex')
}

describe('checkoutSignatureIsValid', () => {
  const paymentId = 'pay_ABC123'
  const subscriptionId = 'sub_XYZ789'

  it('accepts a signature over payment_id|subscription_id, in that order', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, KEY_SECRET)
    expect(checkoutSignatureIsValid({ paymentId, subscriptionId, signature, keySecret: KEY_SECRET })).toBe(true)
  })

  it('rejects the two ids concatenated in the other order', () => {
    const signature = sign(`${subscriptionId}|${paymentId}`, KEY_SECRET)
    expect(checkoutSignatureIsValid({ paymentId, subscriptionId, signature, keySecret: KEY_SECRET })).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, 'wrong_secret')
    expect(checkoutSignatureIsValid({ paymentId, subscriptionId, signature, keySecret: KEY_SECRET })).toBe(false)
  })

  it('rejects a valid signature replayed against a different subscription', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, KEY_SECRET)
    expect(
      checkoutSignatureIsValid({
        paymentId,
        subscriptionId: 'sub_SOMEONE_ELSE',
        signature,
        keySecret: KEY_SECRET,
      }),
    ).toBe(false)
  })

  it.each([[''], ['not-hex-at-all'], ['abc'], ['0'.repeat(63)], ['0'.repeat(65)]])(
    'rejects the malformed signature %s',
    (signature) => {
      expect(checkoutSignatureIsValid({ paymentId, subscriptionId, signature, keySecret: KEY_SECRET })).toBe(false)
    },
  )

  it('rejects rather than throws when the secret is empty', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, KEY_SECRET)
    expect(checkoutSignatureIsValid({ paymentId, subscriptionId, signature, keySecret: '' })).toBe(false)
  })
})

describe('webhookSignatureIsValid', () => {
  const rawBody = '{"event":"subscription.activated","payload":{}}'

  it('accepts a signature over the exact raw body', () => {
    const signature = sign(rawBody, WEBHOOK_SECRET)
    expect(webhookSignatureIsValid({ rawBody, signature, webhookSecret: WEBHOOK_SECRET })).toBe(true)
  })

  it('rejects a body that has been re-serialised', () => {
    // The classic bug: JSON.parse then JSON.stringify changes whitespace and
    // key order, and the signature no longer matches. Razorpay's docs are
    // explicit that the RAW body must be hashed.
    const signature = sign(rawBody, WEBHOOK_SECRET)
    const reserialised = JSON.stringify(JSON.parse(rawBody))
    expect(reserialised).not.toBe(rawBody)
    expect(webhookSignatureIsValid({ rawBody: reserialised, signature, webhookSecret: WEBHOOK_SECRET })).toBe(false)
  })

  it('rejects a body with one byte changed', () => {
    const signature = sign(rawBody, WEBHOOK_SECRET)
    const tampered = rawBody.replace('activated', 'cancelled')
    expect(webhookSignatureIsValid({ rawBody: tampered, signature, webhookSecret: WEBHOOK_SECRET })).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    expect(
      webhookSignatureIsValid({ rawBody, signature: sign(rawBody, 'wrong'), webhookSecret: WEBHOOK_SECRET }),
    ).toBe(false)
  })

  it.each([[''], ['zz'], ['0'.repeat(64)]])('rejects the bogus signature %s', (signature) => {
    expect(webhookSignatureIsValid({ rawBody, signature, webhookSecret: WEBHOOK_SECRET })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it — must fail**

Run: `npx vitest run src/server/billing/signatures.test.ts`
Expected: FAIL, cannot resolve `./signatures`.

- [ ] **Step 3: Implement**

```ts
import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The two HMAC-SHA256 checks Razorpay defines. Nothing else lives in this file
 * -- it is the security boundary for the whole billing milestone and should be
 * readable in one sitting.
 *
 * Both compare in constant time. The practical risk of a timing oracle on a
 * 64-character hex digest over the public internet is small; the cost of
 * `timingSafeEqual` is nothing, and "small" is not an argument anyone should
 * have to re-litigate when reading this later.
 *
 * Both return a boolean rather than throwing. A failed signature is an
 * expected condition on a public endpoint -- it is what an attacker's request
 * looks like -- and the caller decides the response code.
 */

/**
 * Constant-time comparison of two hex digests.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so the length is
 * checked on the STRINGS first and short-circuits. That leak is the length of
 * the attacker's own input, which they already know.
 *
 * `Buffer.from(s, 'hex')` silently stops at the first non-hex character rather
 * than throwing, so 'zz' decodes to an empty buffer. Comparing the decoded
 * lengths as well catches that: a malformed signature can never decode to the
 * same length as a real 32-byte digest unless it is genuinely 64 hex
 * characters.
 */
function hexDigestsMatch(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false
  const expectedBytes = Buffer.from(expected, 'hex')
  const receivedBytes = Buffer.from(received, 'hex')
  if (expectedBytes.length === 0 || expectedBytes.length !== receivedBytes.length) return false
  return timingSafeEqual(expectedBytes, receivedBytes)
}

/**
 * The signature Razorpay Checkout hands the browser on a successful
 * subscription payment: HMAC-SHA256 of `payment_id|subscription_id` keyed with
 * the API key secret.
 *
 * The order of the two ids is load-bearing and is NOT the same as the
 * order used for one-off orders. A test pins it.
 *
 * Passing this proves the message was not forged. It does NOT prove the
 * subscription is active, or that it belongs to the person whose session sent
 * it -- `confirmSubscription` checks ownership against our own row and then
 * re-fetches the real status from Razorpay. This function is one of three
 * things that have to be true, not the whole check.
 */
export function checkoutSignatureIsValid({
  paymentId,
  subscriptionId,
  signature,
  keySecret,
}: {
  paymentId: string
  subscriptionId: string
  signature: string
  keySecret: string
}): boolean {
  if (keySecret.length === 0) return false
  const expected = createHmac('sha256', keySecret).update(`${paymentId}|${subscriptionId}`).digest('hex')
  return hexDigestsMatch(expected, signature)
}

/**
 * The `X-Razorpay-Signature` header on a webhook: HMAC-SHA256 of the raw
 * request body keyed with the webhook secret.
 *
 * `rawBody` must be the bytes as received. Parsing and re-serialising changes
 * whitespace and key order and the signature will not match -- a test pins
 * that too, because it is the mistake everyone makes once.
 */
export function webhookSignatureIsValid({
  rawBody,
  signature,
  webhookSecret,
}: {
  rawBody: string
  signature: string
  webhookSecret: string
}): boolean {
  if (webhookSecret.length === 0) return false
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
  return hexDigestsMatch(expected, signature)
}
```

- [ ] **Step 4: Run the tests — all pass**

Run: `npx vitest run src/server/billing/signatures.test.ts`

- [ ] **Step 5: Run the gate** — `npm run verify`

- [ ] **Step 6: Commit** — `feat(billing): verify both Razorpay signatures in constant time`

---

### Task 5: The subscriptions repository

**Files:**
- Create: `src/server/db/repositories/subscriptions.ts`, `src/server/db/repositories/subscriptions.test.ts`
- Modify: `src/server/db/repositories/index.ts` (follow whatever it already re-exports)

**Interfaces:**
- Consumes: `SubscriptionStatus`, `isSubscriptionStatus` from `@/lib/billing/subscription`.
- Produces:
  - `type Subscription = { userId, razorpaySubscriptionId, razorpayPlanId, razorpayCustomerId: string | null, status: SubscriptionStatus, currentStart: Date | null, currentEnd: Date | null, chargeAt: Date | null, cancelAtCycleEnd: boolean, endedAt: Date | null, lastEventAt: Date | null, createdAt: Date, updatedAt: Date }`
  - `getSubscription(userId: string): Promise<Subscription | null>`
  - `upsertSubscription(userId: string, input: SubscriptionUpsert): Promise<Subscription>`
  - `applySubscriptionEvent(userId: string, razorpaySubscriptionId: string, patch: SubscriptionEventPatch): Promise<number>`
  - `type SubscriptionUpsert`, `type SubscriptionEventPatch` (fields below)

**The webhook and the `userId`-first rule.** A webhook has no session, so the obvious implementation looks up the row by `razorpay_subscription_id` alone — a query that does not scope by `userId`, which `CLAUDE.md` makes a stop-and-ask. It is avoided rather than excused: the subscription is created with `notes.user_id`, Razorpay echoes `notes` back on every event, and the payload is signature-verified before anything reads it. So `applySubscriptionEvent` takes the `userId` from the signed payload and scopes on **both** columns. A mismatch updates zero rows, which the caller logs. The convention holds with no exception.

- [ ] **Step 1: Write the failing test**

These tests run against a fake Prisma client, not the database — the point is the *scoping and mapping*, which is where the leak would be. `getPrisma` is mocked.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const upsert = vi.fn()
const updateMany = vi.fn()

vi.mock('../client', () => ({
  getPrisma: () => ({ subscriptions: { findUnique, upsert, updateMany } }),
}))

const { applySubscriptionEvent, getSubscription, upsertSubscription } = await import('./subscriptions')

const USER = '11111111-1111-1111-1111-111111111111'

function row(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER,
    razorpay_subscription_id: 'sub_1',
    razorpay_plan_id: 'plan_1',
    razorpay_customer_id: null,
    status: 'active',
    current_start: new Date('2026-09-17T00:00:00Z'),
    current_end: new Date('2026-10-17T00:00:00Z'),
    charge_at: new Date('2026-10-17T00:00:00Z'),
    cancel_at_cycle_end: false,
    ended_at: null,
    last_event_at: null,
    created_at: new Date('2026-09-17T00:00:00Z'),
    updated_at: new Date('2026-09-17T00:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  findUnique.mockReset()
  upsert.mockReset()
  updateMany.mockReset()
})

describe('getSubscription', () => {
  it('scopes the query to the given user', async () => {
    findUnique.mockResolvedValue(row())
    await getSubscription(USER)
    expect(findUnique).toHaveBeenCalledWith({ where: { user_id: USER } })
  })

  it('maps snake_case columns onto the camelCase type', async () => {
    findUnique.mockResolvedValue(row({ razorpay_customer_id: 'cust_9', cancel_at_cycle_end: true }))
    const subscription = await getSubscription(USER)
    expect(subscription).not.toBeNull()
    expect(subscription?.razorpaySubscriptionId).toBe('sub_1')
    expect(subscription?.razorpayCustomerId).toBe('cust_9')
    expect(subscription?.cancelAtCycleEnd).toBe(true)
    expect(subscription?.status).toBe('active')
  })

  it('returns null when the user has never subscribed', async () => {
    findUnique.mockResolvedValue(null)
    expect(await getSubscription(USER)).toBeNull()
  })

  it('throws rather than guessing when the stored status is not one Razorpay defines', async () => {
    // A value outside the check constraint means the database and the code
    // have diverged. Coercing it would decide someone's access by accident.
    findUnique.mockResolvedValue(row({ status: 'trialing' }))
    await expect(getSubscription(USER)).rejects.toThrow(/trialing/)
  })
})

describe('upsertSubscription', () => {
  it('keys the upsert on user_id and writes user_id on create', async () => {
    upsert.mockResolvedValue(row())
    await upsertSubscription(USER, {
      razorpaySubscriptionId: 'sub_2',
      razorpayPlanId: 'plan_1',
      status: 'created',
    })
    const call = upsert.mock.calls[0]?.[0]
    expect(call.where).toEqual({ user_id: USER })
    expect(call.create.user_id).toBe(USER)
    expect(call.create.razorpay_subscription_id).toBe('sub_2')
    expect(call.update.razorpay_subscription_id).toBe('sub_2')
    // The update branch must not be able to move the row to another user.
    expect(call.update.user_id).toBeUndefined()
  })
})

describe('applySubscriptionEvent', () => {
  const patch = {
    status: 'active' as const,
    currentStart: new Date('2026-09-17T00:00:00Z'),
    currentEnd: new Date('2026-10-17T00:00:00Z'),
    chargeAt: null,
    endedAt: null,
    razorpayCustomerId: 'cust_9',
    cancelAtCycleEnd: false,
    eventAt: new Date('2026-09-17T12:00:00Z'),
  }

  it('scopes on BOTH user_id and the razorpay subscription id', async () => {
    updateMany.mockResolvedValue({ count: 1 })
    await applySubscriptionEvent(USER, 'sub_1', patch)
    const where = updateMany.mock.calls[0]?.[0].where
    expect(where.user_id).toBe(USER)
    expect(where.razorpay_subscription_id).toBe('sub_1')
  })

  it('refuses to apply an event older than the last one seen, in the WHERE clause', async () => {
    updateMany.mockResolvedValue({ count: 0 })
    await applySubscriptionEvent(USER, 'sub_1', patch)
    const where = updateMany.mock.calls[0]?.[0].where
    // The guard must be part of the statement, not a read-then-write: two
    // deliveries can race, and a check in application code would let the
    // older one win.
    expect(where.OR).toEqual([
      { last_event_at: null },
      { last_event_at: { lte: patch.eventAt } },
    ])
  })

  it('stores the event timestamp so the next delivery can be ordered against it', async () => {
    updateMany.mockResolvedValue({ count: 1 })
    await applySubscriptionEvent(USER, 'sub_1', patch)
    expect(updateMany.mock.calls[0]?.[0].data.last_event_at).toEqual(patch.eventAt)
  })

  it('reports how many rows it actually changed', async () => {
    updateMany.mockResolvedValue({ count: 0 })
    expect(await applySubscriptionEvent(USER, 'sub_1', patch)).toBe(0)
    updateMany.mockResolvedValue({ count: 1 })
    expect(await applySubscriptionEvent(USER, 'sub_1', patch)).toBe(1)
  })
})
```

- [ ] **Step 2: Run it — must fail.** `npx vitest run src/server/db/repositories/subscriptions.test.ts`

- [ ] **Step 3: Implement `src/server/db/repositories/subscriptions.ts`**

Follow `voice-profiles.ts` for house style: `import 'server-only'`, a `Row` type, a single `toSubscription` mapper, a doc comment opening with the authorization warning. Key details:

- `toSubscription` calls `isSubscriptionStatus(row.status)` and throws `new Error(\`subscriptions.status holds ${row.status}, which is not a Razorpay subscription state\`)` when false. **No cast.**
- `upsertSubscription(userId, input)`: `upsert({ where: { user_id: userId }, create: { user_id: userId, ...columns }, update: { ...columns } })` — `update` never includes `user_id`.
- `applySubscriptionEvent(userId, razorpaySubscriptionId, patch)`: `updateMany({ where: { user_id: userId, razorpay_subscription_id: razorpaySubscriptionId, OR: [{ last_event_at: null }, { last_event_at: { lte: patch.eventAt } }] }, data: { ...columns, last_event_at: patch.eventAt } })`, returning `result.count`.
- `SubscriptionUpsert = { razorpaySubscriptionId: string; razorpayPlanId: string; status: SubscriptionStatus; razorpayCustomerId?: string | null; currentStart?: Date | null; currentEnd?: Date | null; chargeAt?: Date | null; cancelAtCycleEnd?: boolean; endedAt?: Date | null; lastEventAt?: Date | null }`
- `SubscriptionEventPatch = { status: SubscriptionStatus; currentStart: Date | null; currentEnd: Date | null; chargeAt: Date | null; endedAt: Date | null; razorpayCustomerId: string | null; cancelAtCycleEnd: boolean; eventAt: Date }`

Document the webhook/`userId` reasoning in the module comment, in the words used in this task's preamble.

- [ ] **Step 4: Run the tests — pass.** Then `npm run verify`.

- [ ] **Step 5: Commit** — `feat(db): add the subscriptions repository, userId-scoped including the webhook path`

---

### Task 6: The Razorpay HTTP client

**Files:**
- Create: `src/server/billing/razorpay-client.ts`, `src/server/billing/razorpay-client.test.ts`

**Interfaces:**
- Consumes: `getServerEnv` from `@/lib/env.server`; `PLAN_TOTAL_COUNT` from `@/lib/billing/plan`; `isSubscriptionStatus` from `@/lib/billing/subscription`.
- Produces:
  - `type RazorpaySubscription = { id: string; status: SubscriptionStatus; planId: string; customerId: string | null; currentStart: Date | null; currentEnd: Date | null; chargeAt: Date | null; endedAt: Date | null; cancelAtCycleEnd: boolean }`
  - `class RazorpayError extends Error { readonly status: number; readonly code: string | null }`
  - `createRazorpayClient(config: { keyId: string; keySecret: string; fetchImpl?: typeof fetch }): RazorpayClient`
  - `type RazorpayClient = { createSubscription(input: { planId: string; notes: Record<string, string> }): Promise<RazorpaySubscription>; fetchSubscription(id: string): Promise<RazorpaySubscription>; cancelAtCycleEnd(id: string): Promise<RazorpaySubscription> }`
  - `razorpayFromEnv(): { client: RazorpayClient; planId: string; keyId: string }` — throws a named error if any of `RAZORPAY_KEY`, `RAZORPAY_SECRET`, `RAZORPAY_PLAN_ID` is unset.

- [ ] **Step 1: Write the failing test**

A fake `fetch` is injected, so no network is touched.

```ts
import { describe, expect, it, vi } from 'vitest'
import { RazorpayError, createRazorpayClient } from './razorpay-client'

const SUBSCRIPTION_JSON = {
  id: 'sub_1',
  entity: 'subscription',
  plan_id: 'plan_1',
  customer_id: 'cust_1',
  status: 'active',
  current_start: 1758067200,
  current_end: 1760745600,
  charge_at: 1760745600,
  ended_at: null,
  total_count: 120,
  paid_count: 1,
  short_url: 'https://rzp.io/rzp/abc',
  notes: { user_id: 'u1' },
}

function fakeFetch(body: unknown, init: { status?: number } = {}) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

function client(fetchImpl: typeof fetch) {
  return createRazorpayClient({ keyId: 'rzp_test_k', keySecret: 's3cret', fetchImpl })
}

describe('createSubscription', () => {
  it('POSTs to the subscriptions endpoint with Basic auth and the plan', async () => {
    const fetchImpl = fakeFetch(SUBSCRIPTION_JSON)
    await client(fetchImpl).createSubscription({ planId: 'plan_1', notes: { user_id: 'u1' } })

    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions')
    expect(init?.method).toBe('POST')

    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe(
      `Basic ${Buffer.from('rzp_test_k:s3cret').toString('base64')}`,
    )
    expect(headers.get('content-type')).toBe('application/json')

    const sent = JSON.parse(String(init?.body))
    expect(sent.plan_id).toBe('plan_1')
    expect(sent.total_count).toBe(120)
    expect(sent.notes).toEqual({ user_id: 'u1' })
    // Razorpay emails the customer itself unless told not to; LinkBud owns its
    // own transactional email (Resend, Milestone 6).
    expect(sent.customer_notify).toBe(0)
  })

  it('maps the response onto Date objects and a narrowed status', async () => {
    const subscription = await client(fakeFetch(SUBSCRIPTION_JSON)).createSubscription({
      planId: 'plan_1',
      notes: {},
    })
    expect(subscription.id).toBe('sub_1')
    expect(subscription.status).toBe('active')
    expect(subscription.planId).toBe('plan_1')
    expect(subscription.customerId).toBe('cust_1')
    expect(subscription.currentStart).toEqual(new Date(1758067200 * 1000))
    expect(subscription.currentEnd).toEqual(new Date(1760745600 * 1000))
    expect(subscription.endedAt).toBeNull()
  })

  it('treats a null customer_id as not yet assigned rather than failing', async () => {
    const subscription = await client(
      fakeFetch({ ...SUBSCRIPTION_JSON, customer_id: null, current_start: null, current_end: null, status: 'created' }),
    ).createSubscription({ planId: 'plan_1', notes: {} })
    expect(subscription.customerId).toBeNull()
    expect(subscription.currentStart).toBeNull()
    expect(subscription.status).toBe('created')
  })
})

describe('error handling', () => {
  it('raises RazorpayError carrying the HTTP status and Razorpay error code', async () => {
    const fetchImpl = fakeFetch(
      { error: { code: 'BAD_REQUEST_ERROR', description: 'plan_id is not a valid id', reason: 'input_validation_failed' } },
      { status: 400 },
    )
    const thrown = await client(fetchImpl)
      .createSubscription({ planId: 'nope', notes: {} })
      .catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(RazorpayError)
    expect(thrown).toMatchObject({ status: 400, code: 'BAD_REQUEST_ERROR' })
    expect(String(thrown)).toContain('plan_id is not a valid id')
  })

  it('does not leak the key secret into the error message', async () => {
    const fetchImpl = fakeFetch({ error: { code: 'SERVER_ERROR', description: 'boom' } }, { status: 500 })
    const thrown = await client(fetchImpl)
      .fetchSubscription('sub_1')
      .catch((error: unknown) => error)
    expect(String(thrown)).not.toContain('s3cret')
  })

  it('raises RazorpayError rather than a parse error when the body is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>gateway timeout</html>', { status: 504 }))
    const thrown = await client(fetchImpl)
      .fetchSubscription('sub_1')
      .catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(RazorpayError)
    expect(thrown).toMatchObject({ status: 504 })
  })

  it('raises RazorpayError when a 200 body is missing required fields', async () => {
    const thrown = await client(fakeFetch({ id: 'sub_1' }))
      .fetchSubscription('sub_1')
      .catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(RazorpayError)
  })

  it('raises RazorpayError when the status is not one Razorpay documents', async () => {
    const thrown = await client(fakeFetch({ ...SUBSCRIPTION_JSON, status: 'trialing' }))
      .fetchSubscription('sub_1')
      .catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(RazorpayError)
    expect(String(thrown)).toContain('trialing')
  })
})

describe('fetchSubscription and cancelAtCycleEnd', () => {
  it('GETs the subscription by id', async () => {
    const fetchImpl = fakeFetch(SUBSCRIPTION_JSON)
    await client(fetchImpl).fetchSubscription('sub_1')
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions/sub_1')
    expect(init?.method).toBe('GET')
  })

  it('POSTs cancel_at_cycle_end so the user keeps the cycle they paid for', async () => {
    const fetchImpl = fakeFetch({ ...SUBSCRIPTION_JSON, status: 'active' })
    await client(fetchImpl).cancelAtCycleEnd('sub_1')
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions/sub_1/cancel')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ cancel_at_cycle_end: 1 })
  })

  it('percent-encodes an id so a crafted one cannot reach another path', async () => {
    const fetchImpl = fakeFetch(SUBSCRIPTION_JSON)
    await client(fetchImpl).fetchSubscription('sub_1/../../payments')
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.razorpay.com/v1/subscriptions/sub_1%2F..%2F..%2Fpayments',
    )
  })
})
```

- [ ] **Step 2: Run it — must fail.** `npx vitest run src/server/billing/razorpay-client.test.ts`

- [ ] **Step 3: Implement**

Shape, with the reasoning that must appear as comments:

```ts
import 'server-only'
import { z } from 'zod'
import { PLAN_TOTAL_COUNT } from '@/lib/billing/plan'
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '@/lib/billing/subscription'
import { getServerEnv } from '@/lib/env.server'

const API_BASE = 'https://api.razorpay.com/v1'

/**
 * A failed Razorpay call, carrying enough to act on and nothing that should
 * not be logged. The key secret is never part of the message -- a test pins
 * that, because an error object is the most likely thing to end up in a log
 * aggregator.
 */
export class RazorpayError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null = null) {
    super(message)
    this.name = 'RazorpayError'
  }
}
```

- Zod schema `subscriptionSchema`: `id: z.string()`, `plan_id: z.string()`, `customer_id: z.string().nullable().optional()`, `status: z.enum(SUBSCRIPTION_STATUSES)`, and `z.number().nullable().optional()` for `current_start`, `current_end`, `charge_at`, `ended_at`. **`z.enum(SUBSCRIPTION_STATUSES)` is what makes an undocumented status a parse failure rather than a cast** — say so in a comment.
- `secondsToDate(value: number | null | undefined): Date | null`.
- `request()`: builds `Authorization: Basic base64(keyId:keySecret)`, `content-type: application/json`; reads the body with `await response.text()` then `JSON.parse` inside a `try` so a non-JSON error page becomes a `RazorpayError` with the HTTP status; on `!response.ok` parses `{ error: { code, description } }` best-effort and throws; on ok, `subscriptionSchema.safeParse` and throws `RazorpayError(..., response.status)` on failure, including the offending value in the message.
- Path building uses `encodeURIComponent(id)` — a test pins it.
- `razorpayFromEnv()`: reads the three keys **inside the function body**, throws `new Error('Razorpay is not configured: set RAZORPAY_KEY, RAZORPAY_SECRET and RAZORPAY_PLAN_ID')` naming whichever are missing, and returns `{ client, planId, keyId }`.

- [ ] **Step 4: Run tests, then the gate.** `npx vitest run src/server/billing/razorpay-client.test.ts` then `npm run verify`.

- [ ] **Step 5: Commit** — `feat(billing): add the Razorpay HTTP client, no SDK`

---

### Task 7: Webhook event mapping

Pure function, no I/O, no crypto. The riskiest logic in the milestone after the signature check.

**Files:**
- Create: `src/server/billing/webhook-events.ts`, `src/server/billing/webhook-events.test.ts`

**Interfaces:**
- Consumes: `SubscriptionEventPatch` from `@/server/db/repositories/subscriptions`; `SUBSCRIPTION_STATUSES` from `@/lib/billing/subscription`.
- Produces: `readWebhookEvent(body: unknown): { userId: string; razorpaySubscriptionId: string; patch: SubscriptionEventPatch } | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { readWebhookEvent } from './webhook-events'

const SUBSCRIPTION_EVENTS = [
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.completed',
  'subscription.updated',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.paused',
  'subscription.resumed',
] as const

function event(name: string, entity: Record<string, unknown> = {}) {
  return {
    entity: 'event',
    event: name,
    created_at: 1758110400,
    payload: {
      subscription: {
        entity: {
          id: 'sub_1',
          plan_id: 'plan_1',
          customer_id: 'cust_1',
          status: 'active',
          current_start: 1758067200,
          current_end: 1760745600,
          charge_at: 1760745600,
          ended_at: null,
          notes: { user_id: 'u1' },
          ...entity,
        },
      },
    },
  }
}

describe('readWebhookEvent', () => {
  it.each(SUBSCRIPTION_EVENTS)('reads %s', (name) => {
    const read = readWebhookEvent(event(name))
    expect(read).not.toBeNull()
    expect(read?.userId).toBe('u1')
    expect(read?.razorpaySubscriptionId).toBe('sub_1')
  })

  it('takes the status from the entity, not from the event name', () => {
    // subscription.charged arrives with status active; subscription.cancelled
    // can arrive with status active when the cancellation is scheduled for the
    // end of the cycle. Reading the name instead of the entity would lock out
    // a customer who cancelled but has three weeks left.
    const read = readWebhookEvent(event('subscription.cancelled', { status: 'active' }))
    expect(read?.patch.status).toBe('active')
  })

  it('carries the event timestamp so deliveries can be ordered', () => {
    expect(readWebhookEvent(event('subscription.activated'))?.patch.eventAt)
      .toEqual(new Date(1758110400 * 1000))
  })

  it('converts every unix second field to a Date and null to null', () => {
    const read = readWebhookEvent(event('subscription.activated', { ended_at: 1760745600 }))
    expect(read?.patch.currentStart).toEqual(new Date(1758067200 * 1000))
    expect(read?.patch.chargeAt).toEqual(new Date(1760745600 * 1000))
    expect(read?.patch.endedAt).toEqual(new Date(1760745600 * 1000))

    const empty = readWebhookEvent(event('subscription.pending', {
      current_start: null, current_end: null, charge_at: null, status: 'pending',
    }))
    expect(empty?.patch.currentStart).toBeNull()
    expect(empty?.patch.chargeAt).toBeNull()
  })

  it('reads a scheduled cancellation from the entity flag', () => {
    expect(readWebhookEvent(event('subscription.updated', { has_scheduled_changes: false }))?.patch.cancelAtCycleEnd)
      .toBe(false)
    expect(readWebhookEvent(event('subscription.cancelled', { status: 'active', end_at: 1760745600 }))).not.toBeNull()
  })

  it.each([['payment.captured'], ['payment.failed'], ['order.paid'], ['invoice.paid']])(
    'ignores the unrelated event %s',
    (name) => {
      expect(readWebhookEvent(event(name))).toBeNull()
    },
  )

  it('ignores an event whose notes carry no user_id', () => {
    // Without it there is nothing to scope the write on, and guessing by
    // subscription id alone would be an unscoped query.
    expect(readWebhookEvent(event('subscription.activated', { notes: {} }))).toBeNull()
    expect(readWebhookEvent(event('subscription.activated', { notes: { user_id: 42 } }))).toBeNull()
  })

  it('ignores an event carrying a status Razorpay does not document', () => {
    expect(readWebhookEvent(event('subscription.activated', { status: 'trialing' }))).toBeNull()
  })

  it.each([[null], [undefined], ['a string'], [42], [{}], [{ event: 'subscription.activated' }]])(
    'returns null for the malformed body %s rather than throwing',
    (body) => {
      expect(readWebhookEvent(body)).toBeNull()
    },
  )
})
```

- [ ] **Step 2: Run it — must fail.**

- [ ] **Step 3: Implement with a Zod schema**

```ts
/**
 * Turn a verified Razorpay webhook body into the write it implies, or null.
 *
 * Pure: no I/O, no crypto, no database. The route calls this only after the
 * signature has been checked, so the payload is trusted input by the time it
 * arrives -- including `notes.user_id`, which is what lets the write stay
 * scoped to a user (see the subscriptions repository).
 *
 * `null` means "nothing to do", NOT "something went wrong". Razorpay sends
 * payment and invoice events on the same endpoint and retries anything that is
 * not answered with a 2xx, so an event we do not act on must be accepted
 * quietly rather than retried forever.
 *
 * **The status comes from the entity, never from the event name.** The two
 * disagree in a case that matters: a cancellation scheduled for the end of the
 * cycle arrives as `subscription.cancelled` while the entity is still
 * `active`, because the customer has paid for the rest of the period. Deriving
 * status from the name would lock out a paying customer three weeks early.
 * A test pins this.
 */
```

Implementation notes: an `eventSchema` with `event: z.string()`, `created_at: z.number()`, `payload.subscription.entity` shaped as in Task 6 plus `notes: z.record(z.string(), z.unknown())` and `end_at: z.number().nullable().optional()`. Use `safeParse`; return `null` on failure. Gate on `parsed.data.event.startsWith('subscription.')`. Read `notes.user_id` and return `null` unless `typeof userId === 'string' && userId.length > 0`. `status` validated by `z.enum(SUBSCRIPTION_STATUSES)` inside the schema, so an undocumented status makes the whole parse fail and returns `null`. `cancelAtCycleEnd` is `entity.end_at != null && entity.status === 'active'`.

- [ ] **Step 4: Run tests, then the gate.**

- [ ] **Step 5: Commit** — `feat(billing): map Razorpay subscription webhooks onto a scoped write`

---

### Task 8: The webhook route

**Files:**
- Create: `src/app/api/razorpay/webhook/route.ts`

**Interfaces:**
- Consumes: `webhookSignatureIsValid`, `readWebhookEvent`, `applySubscriptionEvent`, `getServerEnv`.
- Produces: `POST /api/razorpay/webhook`.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server'
import { getServerEnv } from '@/lib/env.server'
import { applySubscriptionEvent } from '@/server/db/repositories/subscriptions'
import { readWebhookEvent } from '@/server/billing/webhook-events'
import { webhookSignatureIsValid } from '@/server/billing/signatures'

/**
 * Razorpay's webhook endpoint -- the authoritative path for subscription
 * state, and the only one that works when the customer's browser dies
 * immediately after paying.
 *
 * Three rules govern the response code, and they are not interchangeable:
 *
 *   401 -- the signature did not verify. This is the only rejection. It must
 *          not be 200: a wrong webhook secret would otherwise look healthy in
 *          the Razorpay dashboard forever while no state was ever written.
 *   200 -- everything else, including an event we do not act on and an event
 *          discarded as stale. Razorpay retries any non-2xx, so answering
 *          "I chose not to act" with an error produces an infinite retry loop
 *          over an event that will never be actionable.
 *   500 -- only a genuine failure on our side (the database is down), where a
 *          retry is exactly what we want.
 *
 * The body is read with `request.text()` and hashed as received. Calling
 * `request.json()` first and re-serialising changes whitespace and key order,
 * and the signature will not match -- see signatures.test.ts.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = getServerEnv().RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    console.error('LinkBud: RAZORPAY_WEBHOOK_SECRET is not set; refusing the webhook')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature') ?? ''

  if (!webhookSignatureIsValid({ rawBody, signature, webhookSecret: secret })) {
    console.warn('LinkBud: rejected a Razorpay webhook with an invalid signature')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    // Signed but unparseable should be impossible. A retry cannot fix it.
    console.error('LinkBud: a signature-valid Razorpay webhook body was not JSON')
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const read = readWebhookEvent(body)
  if (!read) return NextResponse.json({ ok: true }, { status: 200 })

  try {
    const updated = await applySubscriptionEvent(read.userId, read.razorpaySubscriptionId, read.patch)
    if (updated === 0) {
      // Either the event is older than one already applied (the ordering
      // guard did its job), or no row matches that user and subscription.
      // Both are worth seeing and neither is worth a retry.
      console.warn(
        `LinkBud: Razorpay webhook for subscription ${read.razorpaySubscriptionId} changed no rows ` +
          `(stale event, or no matching subscription for that user)`,
      )
    }
  } catch (error) {
    console.error(
      `LinkBud: failed to apply a Razorpay webhook for subscription ${read.razorpaySubscriptionId} - ` +
        (error instanceof Error ? `${error.name}: ${error.message}` : String(error)),
    )
    // Our fault, so let Razorpay retry.
    return NextResponse.json({ error: 'apply failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
```

- [ ] **Step 2: Confirm the route is not caught by the session proxy**

Run: `cat src/proxy.ts`

`src/proxy.ts` refreshes the session and does not guard routes, so it will not block this — but confirm its matcher does not rewrite `/api/*`. If it does, exclude `/api/razorpay/webhook`: a webhook carries no cookies and must not be redirected.

- [ ] **Step 3: Run the gate** — `npm run verify`. Confirm the build output now lists `ƒ /api/razorpay/webhook`.

- [ ] **Step 4: Commit** — `feat(billing): accept Razorpay subscription webhooks`

---

### Task 9: Move the paywall ahead of the strategy

**Files:**
- Modify: `src/lib/onboarding/steps.ts`, `src/lib/onboarding/steps.test.ts`
- Modify: `src/lib/onboarding/dashboard-copy.ts`, `src/lib/onboarding/dashboard-copy.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ONBOARDING_STEPS` reordered to `['interview','samples','voice','paywall','strategy','done']`; `PAGE_ROUTE_BY_STEP.paywall = '/billing'`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/onboarding/steps.test.ts`:

```ts
describe('the paywall sits before the strategy (spec §1.2, amended 2026-09-17)', () => {
  it('orders the steps interview, samples, voice, paywall, strategy, done', () => {
    expect([...ONBOARDING_STEPS]).toEqual([
      'interview', 'samples', 'voice', 'paywall', 'strategy', 'done',
    ])
  })

  it('sends a user who has just finished the voice step to the paywall', () => {
    expect(nextStep('voice')).toBe('paywall')
  })

  it('sends a paid user on to the strategy step', () => {
    expect(nextStep('paywall')).toBe('strategy')
  })

  it('routes the paywall step to /billing', () => {
    expect(routeForStep('paywall')).toBe('/billing')
    expect(onboardingRouteFor('paywall')).toBe('/billing')
  })

  it('gives every step except done a page, retiring Ruling R3', () => {
    // R3 let `paywall` fall through to /dashboard because Milestone 4 had not
    // built its page. It has now. A step with no page means an unfinished
    // user can reach the product, so the exception must not come back.
    for (const step of ONBOARDING_STEPS) {
      if (step === 'done') {
        expect(onboardingRouteFor(step)).toBeNull()
      } else {
        expect(onboardingRouteFor(step)).not.toBeNull()
      }
    }
  })

  it('treats a paywall user as not past the strategy step', () => {
    expect(isPastStep('paywall', 'strategy')).toBe(false)
    expect(isPastStep('paywall', 'voice')).toBe(true)
    expect(isPastStep('strategy', 'paywall')).toBe(true)
  })
})
```

- [ ] **Step 2: Run them — they fail.** `npx vitest run src/lib/onboarding/steps.test.ts`

- [ ] **Step 3: Make the change**

In `steps.ts`: move `'paywall'` before `'strategy'` in `ONBOARDING_STEPS`, and add `paywall: '/billing'` to `PAGE_ROUTE_BY_STEP`. Then **rewrite the doc comments that are now false** — several of them describe Ruling R3 in the present tense:

- The `PAGE_ROUTE_BY_STEP` comment says "Milestone 4 adds `paywall` the same way" — change to past tense and note that every step but `done` now has a page.
- The `routeForStep` comment's whole "Ruling R3, narrowed by Milestone 3" paragraph must be rewritten: R3 is retired. Say that it existed because `paywall` had no page, that Milestone 4 built one at `/billing`, and that the invariant is now unconditional — a user who has not finished any step with a page can never reach the dashboard.
- The `onboardingRouteFor` comment says "`null` for `paywall` and `done`" — now `null` for `done` alone. It must also explain that `/billing` lives outside the `(onboarded)` route group, which is what keeps the redirect loop structurally impossible.

A stale comment on a state machine is worse than no comment; this step is not optional tidying.

- [ ] **Step 4: Update the dashboard copy**

`dashboard-copy.ts`'s `paywall` case currently says the user has a strategy and nothing is being asked of them. Under the new order that is exactly backwards. Replace with copy true for a user who has a Voice Profile and no strategy yet, and who is being asked to subscribe — and rewrite the long module comment paragraph that explains the old meaning. Update `dashboard-copy.test.ts` to assert the new copy mentions neither a strategy the user does not have nor a milestone number.

- [ ] **Step 5: Run tests, then the gate.**

- [ ] **Step 6: Commit** — `feat(onboarding): move the paywall step ahead of the strategy`

---

### Task 10: The entitlement gate

Three enforcement points, one helper. This is where the "a boundary must be complete" rule is cashed in.

**Files:**
- Create: `src/server/billing/entitlement.ts`, `src/server/billing/entitlement.test.ts`
- Modify: `src/app/(app)/(onboarded)/layout.tsx`, `src/app/(app)/onboarding/strategy/page.tsx`, `src/server/strategy/actions.ts`

**Interfaces:**
- Consumes: `getSubscription`, `isEntitled`.
- Produces:
  - `loadEntitlement(userId: string): Promise<{ entitled: boolean; subscription: Subscription | null }>`
  - `requireEntitled(userId: string): Promise<void>` — `redirect('/billing')` when not entitled
  - `entitlementFor(subscription: Subscription | null): boolean` — pure, tested

- [ ] **Step 1: Write the failing test** for the pure part

```ts
import { describe, expect, it } from 'vitest'
import { entitlementFor } from './entitlement'
import { SUBSCRIPTION_STATUSES } from '@/lib/billing/subscription'

function subscriptionWith(status: (typeof SUBSCRIPTION_STATUSES)[number]) {
  return {
    userId: 'u1',
    razorpaySubscriptionId: 'sub_1',
    razorpayPlanId: 'plan_1',
    razorpayCustomerId: null,
    status,
    currentStart: null,
    currentEnd: null,
    chargeAt: null,
    cancelAtCycleEnd: false,
    endedAt: null,
    lastEventAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('entitlementFor', () => {
  it('denies a user with no subscription row at all', () => {
    expect(entitlementFor(null)).toBe(false)
  })

  it.each(SUBSCRIPTION_STATUSES.map((status) => [status]))(
    'agrees with isEntitled for %s',
    (status) => {
      expect(entitlementFor(subscriptionWith(status))).toBe(status === 'active' || status === 'authenticated')
    },
  )

  it('still grants access to a subscription cancelled at cycle end while it is active', () => {
    expect(entitlementFor({ ...subscriptionWith('active'), cancelAtCycleEnd: true })).toBe(true)
  })
})
```

- [ ] **Step 2: Run it — fails. Then implement `entitlement.ts`.**

```ts
import 'server-only'
import { redirect } from 'next/navigation'
import { isEntitled } from '@/lib/billing/subscription'
import { getSubscription, type Subscription } from '@/server/db/repositories/subscriptions'

/**
 * The one place that answers "may this user use the product right now".
 *
 * Called from three enforcement points, and it has to be all three:
 *
 *   1. `(app)/(onboarded)/layout.tsx` -- the dashboard, calendar and strategy
 *      pages.
 *   2. `/onboarding/strategy` -- which lives OUTSIDE that route group, so the
 *      layout cannot cover it.
 *   3. `buildStrategy()` and `briefUpcomingWeek()` -- because a server action
 *      is a public HTTP endpoint. A page redirect constrains a cooperative
 *      browser; a crafted POST skips it entirely, and what it skips past is
 *      six model calls billed to us.
 *
 * Milestone 2 lost four review rounds to guards applied at some of the places
 * and not the rest. Three call sites, one function, no second copy of the
 * rule.
 *
 * Entitlement is recomputed on every request from the stored status. It is
 * never cached on the profile or in a cookie: a cached yes is one missed
 * webhook away from being wrong in the direction that gives the product away.
 */
export function entitlementFor(subscription: Subscription | null): boolean {
  return isEntitled(subscription?.status ?? null)
}

export async function loadEntitlement(
  userId: string,
): Promise<{ entitled: boolean; subscription: Subscription | null }> {
  const subscription = await getSubscription(userId)
  return { entitled: entitlementFor(subscription), subscription }
}

/**
 * Send an unentitled user to `/billing`, which is the page that fixes it.
 *
 * `/billing` sits under `(app)` but OUTSIDE the `(onboarded)` route group, so
 * it never renders through the guard that calls this -- the redirect loop is
 * structurally impossible rather than avoided by comparing paths. Same
 * reasoning as Ruling R8.
 *
 * `redirect()` works by throwing Next's navigation signal, so this must never
 * be called inside a `try` that swallows it.
 */
export async function requireEntitled(userId: string): Promise<void> {
  const { entitled } = await loadEntitlement(userId)
  if (!entitled) redirect('/billing')
}
```

- [ ] **Step 3: Wire enforcement point 1 — `(app)/(onboarded)/layout.tsx`**

After the existing `onboardingRouteFor` redirect, add `await requireEntitled(user.id)`. Extend the layout's doc comment: the group now guards two independent facts — onboarding completeness and live entitlement — and they are checked in that order because a user who has not reached the paywall step should be sent to the step they are on, not to a billing page for a product they have not finished setting up.

- [ ] **Step 4: Wire enforcement point 2 — `/onboarding/strategy/page.tsx`**

After the `isPastStep` check and before loading business/voice profiles, add `await requireEntitled(user.id)`. Comment: this page is outside `(onboarded)`, so the layout guard does not reach it, and the button it renders spends six model calls.

- [ ] **Step 5: Wire enforcement point 3 — `src/server/strategy/actions.ts`**

In **both** `buildStrategy()` and `briefUpcomingWeek()`, immediately after `requireUserId()`, add `await requireEntitled(userId)`. Extend the module doc comment to say why the page check is not enough.

- [ ] **Step 6: Prove the gate by hand before trusting it**

With the dev server running and signed in as a user with no subscription row, from the browser console:

```js
await fetch('/onboarding/strategy', { method: 'POST', headers: { 'next-action': 'x' } })
```

This is a smoke check that the route does not simply render; the real proof is the browser QA in Task 14, which exercises the action through its own button. Record what you saw.

- [ ] **Step 7: Run the gate** — `npm run verify`

- [ ] **Step 8: Commit** — `feat(billing): gate the product on a live subscription at all three entry points`

---

### Task 11: The `/billing` page and the checkout flow

**Files:**
- Create: `src/app/(app)/billing/page.tsx`, `src/server/billing/actions.ts`, `src/components/billing/start-subscription.tsx`, `src/components/billing/cancel-subscription.tsx`, `src/lib/billing/action-result.ts`
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3–6 and 9.
- Produces:
  - `type BillingActionResult = { ok: true } | { ok: false; message: string }` from `@/lib/billing/action-result`
  - `startSubscription(): Promise<{ ok: true; subscriptionId: string; keyId: string } | { ok: false; message: string }>`
  - `confirmSubscription(input: { paymentId: string; subscriptionId: string; signature: string }): Promise<BillingActionResult>`
  - `cancelSubscription(): Promise<BillingActionResult>`

- [ ] **Step 1: `src/lib/billing/action-result.ts`** — mirror `src/lib/strategy/action-result.ts` exactly, including the reasoning comment about declaring the shape once in client-safe `lib`.

- [ ] **Step 2: Write `src/server/billing/actions.ts`**

Each export starts by re-deriving the user from the session (copy `requireUserId` from `src/server/strategy/actions.ts`). The rules that must hold, with comments saying so:

`startSubscription()`
- If `loadEntitlement` says already entitled → `{ ok: false, message: 'You already have an active subscription.' }`. Stops a double-subscribe from a stale tab.
- `razorpayFromEnv()` → `client.createSubscription({ planId, notes: { user_id: userId } })`. **`notes.user_id` is what lets the webhook write stay scoped to a user** — say so.
- `upsertSubscription(userId, { razorpaySubscriptionId: created.id, razorpayPlanId: created.planId, status: created.status, ... })` **before** returning, so a browser that dies between here and the handler still leaves a row the webhook can find.
- Return `{ ok: true, subscriptionId: created.id, keyId }`. The key id is returned rather than published as `NEXT_PUBLIC_` — comment it.

`confirmSubscription({ paymentId, subscriptionId, signature })`
1. `checkoutSignatureIsValid(...)` with `getServerEnv().RAZORPAY_SECRET` → false means reject with a generic message and `console.warn`.
2. `getSubscription(userId)` and require `stored?.razorpaySubscriptionId === subscriptionId`. **Ownership check.** Without it, a signature valid for someone else's subscription would activate this account. Comment it.
3. `client.fetchSubscription(subscriptionId)` — Razorpay's own answer is what gets stored. The signature proves the message was not forged; only the re-fetch proves what is true.
4. `upsertSubscription` with the fetched status and period.
5. If now entitled and `profile.onboardingStep === 'paywall'`, `updateProfile(userId, { onboardingStep: nextStep('paywall') })`.
6. `revalidatePath('/billing'); revalidatePath('/dashboard')` then `redirect(routeForStep(nextStep('paywall')))` when entitled — `/onboarding/strategy`. `redirect()` outside every `try`.

`cancelSubscription()`
- Require an existing row; `client.cancelAtCycleEnd(id)`; `upsertSubscription` with the returned status and `cancelAtCycleEnd: true`; `revalidatePath('/billing')`; return `{ ok: true }` and stay on the page.

- [ ] **Step 3: Write `src/components/billing/start-subscription.tsx`**

`'use client'`. Loads Checkout on demand so a visitor who never taps never downloads third-party JS:

```tsx
/**
 * Razorpay Checkout is a script tag, not a package -- CLAUDE.md treats every
 * dependency as a lifetime cost, and this one would only wrap a global.
 *
 * It is loaded on the first tap rather than with the page: a user who is here
 * to read their status should not pull third-party JavaScript to do it, and
 * the script sets a global that only matters once they decide to pay.
 */
const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

type CheckoutResponse = {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

type CheckoutOptions = {
  key: string
  subscription_id: string
  name: string
  description: string
  handler: (response: CheckoutResponse) => void
  modal: { ondismiss: () => void }
  prefill: { email: string }
  theme: { color: string }
}

type RazorpayCheckout = { open: () => void }

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => RazorpayCheckout
  }
}

function loadCheckout(): Promise<NonNullable<Window['Razorpay']>> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay)
    const script = document.createElement('script')
    script.src = CHECKOUT_SRC
    script.async = true
    script.onload = () => {
      const loaded = window.Razorpay
      if (loaded) resolve(loaded)
      else reject(new Error('Razorpay Checkout loaded but did not register'))
    }
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded'))
    document.body.appendChild(script)
  })
}
```

The component takes `{ email, startSubscription, confirmSubscription }` as props (the two server actions passed down, as `StrategyBuilder` does). On click: `startSubscription()` → on `ok`, `loadCheckout()` → `new Razorpay({...}).open()`. The `handler` calls `confirmSubscription(...)` inside a `startTransition`, using `unstable_rethrow` so the success redirect navigates. `modal.ondismiss` clears the pending state — otherwise closing the modal leaves a spinner forever, which reads as a hang.

**Do not hard-code the theme colour.** Razorpay's `theme.color` needs a hex string and the accent is a CSS token; read it at click time with `getComputedStyle(document.documentElement).getPropertyValue('--lb-accent')`, and if it is empty or not a hex value, **omit `theme` entirely** rather than inventing one. Hard-coding a hex in a component is banned by `CLAUDE.md`, and Razorpay's default is perfectly acceptable.

- [ ] **Step 4: Write `src/components/billing/cancel-subscription.tsx`** — copy the structure of `regenerate-strategy.tsx` (Base UI `Dialog`, pending state, `role="alert"` error). Dialog copy must say what actually happens: billing stops at the end of the current cycle, access continues until then, the strategy and profiles are untouched, and resubscribing later is possible.

- [ ] **Step 5: Write `src/app/(app)/billing/page.tsx`**

Server Component. Loads user, profile and `loadEntitlement`. Three states:

1. **No row, or a row in an ended state** → the paywall. Heading, `PLAN_PRICE_LABEL`, what the subscription buys (in the product's own voice — the 12-week strategy, drafts in their voice, approve-then-publish), and `<StartSubscription />`. When the user is at `onboardingStep === 'paywall'`, add one line saying the strategy is built the moment payment goes through.
2. **Entitled** → `describeStatus(status).label` and `.detail`, the next charge date from `currentEnd` formatted with the user's `profile.timezone`, and `<CancelSubscription />`. If `cancelAtCycleEnd`, replace the cancel button with a line saying when access ends.
3. **`pending` / `halted`** → `describeStatus` copy plus `<StartSubscription />` to set up a fresh mandate.

`tone` from `describeStatus` maps to existing token classes only — no new colours.

- [ ] **Step 6: Add a Billing row to `/settings`** — append to `SECTIONS`: `{ href: '/billing', title: 'Billing', description: 'Your subscription, next charge date and cancellation.' }`.

- [ ] **Step 7: Run the gate** — `npm run verify`. Confirm the build lists `ƒ /billing`.

- [ ] **Step 8: Commit** — `feat(billing): add the paywall and subscription management screen`

---

### Task 12: Documentation

**Files:**
- Modify: `docs/ACCOUNTS.md` (§13 and the secrets table), `docs/ROADMAP.md` (Milestone 4), `docs/BACKLOG.md` (strike the two cleared items), `TASKS.md` (Milestone 0 and Milestone 4)

- [ ] **Step 1: Rewrite `docs/ACCOUNTS.md` §13** from Stripe to Razorpay, in the same imperative voice as its neighbours. Cover: creating the account and completing KYC; **Subscriptions → Plans → New Plan** at ₹1,499, monthly, and where the plan id appears (record `plan_TcyWDCJsx4fnbQ`, already created and verified live on 2026-09-17); **Settings → API Keys** for `RAZORPAY_KEY` / `RAZORPAY_SECRET`, noting `rzp_test_` versus `rzp_live_`; and **Settings → Webhooks → Add New Webhook** pointing at `https://yourdomain.com/api/razorpay/webhook` with the webhook secret going to `RAZORPAY_WEBHOOK_SECRET`. List the exact events to subscribe to: the ten `subscription.*` events from Task 7. Add a "Check it worked" line matching the section's convention. State plainly that **recurring payments in India need the mandate flow**, and that test mode provides cards for it.

- [ ] **Step 2: Update the secrets table** — replace the Stripe row with `Razorpay key secret | .env.local, Vercel | The client, logs, error messages`, and add `Razorpay webhook secret`.

- [ ] **Step 3: Update `docs/ROADMAP.md` Milestone 4** — replace the four Stripe bullets. Remove the `trial_reminder` bullet (Resend has nothing to remind about without a trial) and say so in one line, so a reader does not think it was forgotten.

- [ ] **Step 4: Strike the two `docs/BACKLOG.md` items** cleared in Task 1 — `z.url()` and the env split — following whatever convention the file already uses for a done entry.

- [ ] **Step 5: Update `TASKS.md`** — rewrite Milestone 4's five bullets for what was actually built, mark Milestone 0's Stripe line as a Razorpay line, and record the browser QA evidence from Task 14 once it exists. `TASKS.md` is updated in the same commit as the work it describes, so this step lands with the docs commit and is amended by Task 14's.

- [ ] **Step 6: Run the gate, then commit** — `docs: record the Razorpay paywall`

---

### Task 13: Browser QA

`npm run verify` proves it compiles. It does not prove it works. Nothing in this milestone ships unverified.

**Prerequisite:** `RAZORPAY_WEBHOOK_SECRET` must be set for the webhook leg. If it is not, say so and mark that leg untested rather than skipping it silently.

- [ ] **Step 1: Start the dev server** and use `/ecc:browser-qa`.

- [ ] **Step 2: Signed-out access** — `/billing` redirects to `/login`.

- [ ] **Step 3: The gate, from a user with no subscription** — `/dashboard`, `/calendar`, `/strategy` and `/onboarding/strategy` each land on `/billing`. Screenshot one.

- [ ] **Step 4: The paywall screen** — price reads ₹1,499/month, the copy is true for the user's step, console clean, no horizontal overflow at 1440 **and** 375.

- [ ] **Step 5: A real test-mode checkout** — tap Subscribe, complete Razorpay's test mandate flow, and confirm the browser lands on `/onboarding/strategy`. Check the network panel for a failed request and the console for errors. Then check the database:

```sql
select status, razorpay_subscription_id, current_start, current_end, last_event_at
  from public.subscriptions where user_id = '<your id>';
select onboarding_step from public.profiles where id = '<your id>';
```

Record the real values seen.

- [ ] **Step 6: The unlocked product** — `/dashboard`, `/calendar` and `/strategy` now load. Build the strategy and confirm it completes.

- [ ] **Step 7: The webhook** — replay a signed payload against the dev server and confirm a 200 and a written row:

```bash
BODY='{"entity":"event","event":"subscription.activated","created_at":1758110400,"payload":{"subscription":{"entity":{"id":"<real sub id>","plan_id":"plan_TcyWDCJsx4fnbQ","customer_id":"cust_x","status":"active","current_start":1758067200,"current_end":1760745600,"charge_at":1760745600,"ended_at":null,"notes":{"user_id":"<your id>"}}}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$RAZORPAY_WEBHOOK_SECRET" | awk '{print $2}')
curl -i -X POST http://localhost:3000/api/razorpay/webhook \
  -H "content-type: application/json" -H "x-razorpay-signature: $SIG" -d "$BODY"
```

Expected: `200`. Then repeat with `-H "x-razorpay-signature: deadbeef"` and expect `401`. Then replay the **same** body a second time and confirm `200` with no state damage — and a third time with an **older** `created_at`, confirming the ordering guard logs "changed no rows".

- [ ] **Step 8: Cancel** — tap Cancel, confirm the dialog, and check the page now says when access ends and that `/dashboard` still loads. Verify `cancel_at_cycle_end` is true in the database.

- [ ] **Step 9: Report honestly.** Write what was observed, not what was expected. Name anything untested — a live webhook from Razorpay's own servers needs a public URL and will not have been exercised from localhost, so say so.

- [ ] **Step 10: Kill the dev server. Leave no `.env.local` behind.**

- [ ] **Step 11: Update `TASKS.md`** with the evidence and commit — `docs: record milestone 4 browser QA`

---

## Self-review

**Spec coverage.** §1.2 price and no-trial → Tasks 3, 11. §1.2 gate before the strategy → Tasks 9, 10. §3 Razorpay, no SDK, browser never believed → Tasks 6, 11. §5 `subscriptions` and select-only RLS → Task 2. §7 TDD on billing → Tasks 3, 4, 5, 6, 7, 10. `docs/BACKLOG.md`'s two M4 items → Task 1. `TASKS.md`'s five M4 bullets: Razorpay checkout (11), the gate (10), webhooks and state transitions under TDD (7, 8), `z.url()` (1), env split (1). All covered.

**Known gaps, stated rather than hidden.** No trial means no `trial_reminder` email, so Resend stays untouched by this milestone — Task 12 Step 3 records that as a decision, not an omission. Razorpay cannot deliver a webhook to `localhost`, so Task 13 exercises the endpoint with a locally signed replay and the end-to-end delivery from Razorpay's servers remains untested until a deploy; Task 13 Step 9 requires saying so. The `pending → halted` retry ladder is Razorpay's own and cannot be forced in test mode, so those two states are covered by unit tests only.

**Type consistency.** `SubscriptionStatus` (Task 3) is the status type in Tasks 5, 6, 7 and 10. `SubscriptionEventPatch` (Task 5) is what `readWebhookEvent` returns (Task 7) and what `applySubscriptionEvent` consumes (Tasks 5, 8). `RazorpaySubscription` (Task 6) is consumed only in Task 11. `entitlementFor`/`loadEntitlement`/`requireEntitled` (Task 10) are named identically at all four call sites.
