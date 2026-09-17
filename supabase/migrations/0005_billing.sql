-- LinkBud Milestone 4: billing.
--
-- One table, `subscriptions`, from spec §5. Conventions follow 0003 and 0004,
-- with ONE deliberate and important difference, explained under "Row level
-- security" below: this table gets a SELECT policy and nothing else.
--
-- No foreign key to auth.users, for the reason recorded in 0002. user_id holds
-- auth.users.id and rows are cleaned up by the cascade trigger at the end.
--
-- Nothing here comes from LinkedIn, so the 48-hour purge rule
-- (docs/LINKEDIN-COMPLIANCE.md) does not apply.

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
-- One per user (spec §1.1: one solo coach, one profile), so `unique` on
-- user_id is the correct constraint. A user who cancels and later resubscribes
-- gets a NEW Razorpay subscription id written onto the SAME row -- Razorpay
-- cannot restart a cancelled subscription, and we keep no history of past ones
-- because nothing in v1 reads it (spec §1.2: no proration, no credit ledger).
-- If billing history is ever needed, Razorpay's dashboard is the system of
-- record for it.
--
-- `status` mirrors Razorpay's own eight subscription states exactly, and the
-- check constraint below is the list. Keep it in step with
-- SUBSCRIPTION_STATUSES in src/lib/billing/subscription.ts. We store Razorpay's
-- vocabulary rather than a LinkBud translation of it: a mapping layer here
-- would be one more thing that can silently fall through, and an unmapped
-- state would read as "no subscription" -- which fails open, into free access.
--
-- Entitlement is NOT a column. It is derived from `status` on every request
-- (src/lib/billing/subscription.ts). A cached boolean is one missed webhook
-- away from being a lie, in the direction that gives the product away.
--
-- `last_event_at` is the ordering guard. Razorpay retries webhooks and does
-- not guarantee delivery order, so a stale `subscription.pending` arriving
-- after `subscription.active` would lock out a paying customer. Writes from
-- the webhook path carry the event's own timestamp and are applied only when
-- it is at least as new as this column, inside the UPDATE's WHERE clause --
-- so the check is atomic rather than read-then-write.
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
  -- The current billing cycle. Null until the first charge. Razorpay returns
  -- these as unix seconds; the repository converts.
  current_start            timestamptz,
  current_end              timestamptz,
  charge_at                timestamptz,
  cancel_at_cycle_end      boolean not null default false,
  ended_at                 timestamptz,
  last_event_at            timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- user_id is already unique (and therefore indexed) above; this index exists
-- for the same reason as its siblings in 0004 -- to make the access pattern
-- visible -- and Postgres will use the unique index either way.
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
-- visible in one place rather than depending on remembering the FK graph.
-- subscriptions is deleted first; profiles stays last.
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
  delete from public.profiles          where id      = old.id;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Data migration: onboarding_step 'paywall' changes meaning
-- ---------------------------------------------------------------------------
-- The gate moved ahead of the strategy (spec §1.2, amended 2026-09-17), so the
-- step order is now interview -> samples -> voice -> paywall -> strategy ->
-- done.
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
--
-- The check constraint on profiles.onboarding_step lists values, not an order,
-- so it needs no change.
update public.profiles
   set onboarding_step = 'done'
 where onboarding_step = 'paywall';
