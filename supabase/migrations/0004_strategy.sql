-- LinkBud Milestone 3: strategy.
--
-- Three tables from spec §5 — strategies, pillars, slots. Conventions follow
-- 0003 exactly; read that file first if anything here looks unexplained. RLS
-- is enabled AND forced on every table, every policy is scoped `to
-- authenticated`, and auth.uid() is wrapped in (select ...) so it evaluates
-- once per statement rather than once per row.
--
-- Why RLS still matters even though Prisma bypasses it: the anon key ships in
-- the browser bundle and Supabase's Data API is reachable with it. These
-- policies are what stop anyone who views source from reading every row over
-- REST. Ownership on the Prisma path is enforced by src/server/db/repositories,
-- where every function takes an explicit userId.
--
-- user_id is denormalised onto pillars and slots even though it is reachable
-- through strategies. Two reasons: the RLS policies stay a single equality
-- with no join (see security-rls-performance), and the repositories can scope
-- every query on user_id directly rather than trusting a join to do it.
--
-- No foreign key to auth.users, for the reason recorded in 0002. user_id
-- holds auth.users.id. Rows are cleaned up by the cascade delete at the end.
--
-- Everything in these tables is LinkBud's own generated content. Nothing is
-- fetched from LinkedIn, so the 48-hour purge rule (docs/LINKEDIN-COMPLIANCE.md)
-- does not apply here.

-- ---------------------------------------------------------------------------
-- strategies
-- ---------------------------------------------------------------------------
-- One per user (spec §1.1: one solo coach, one profile), so `unique` on
-- user_id is the correct constraint. Regeneration replaces the pillars and
-- slots inside one transaction and bumps `version` (Ruling R-M3-7).
--
-- cadence_per_week is a snapshot of profiles.cadence_per_week at generation
-- time (Ruling R-M3-9): the slots were laid out at that cadence, and the plan
-- must stay internally consistent if the profile changes later.
--
-- The four phase_* columns are the arc — authority → problem-aware →
-- offer-aware → invitation (spec §4.2) — described for this user. Which
-- phase a given week is in is arithmetic on week_index (Ruling R-M3-3), so it
-- is not stored per slot. week_themes holds exactly twelve entries, one per
-- week, which the check constraint enforces.
create table if not exists public.strategies (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique,
  version             integer not null default 1 check (version >= 1),
  cadence_per_week    smallint not null check (cadence_per_week between 3 and 5),
  -- Always a Monday; the schedule arithmetic assumes it (src/lib/strategy/schedule.ts).
  starts_on           date not null check (extract(isodow from starts_on) = 1),
  positioning         text not null check (length(trim(positioning)) > 0),
  phase_authority     text not null,
  phase_problem_aware text not null,
  phase_offer_aware   text not null,
  phase_invitation    text not null,
  week_themes         text[] not null check (cardinality(week_themes) = 12),
  generated_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- pillars
-- ---------------------------------------------------------------------------
-- 4–5 per strategy (spec §4.2). The count is enforced in application code
-- (the generator's schema), not here — a check constraint cannot count
-- sibling rows without a trigger. position is 1-based display order.
create table if not exists public.pillars (
  id           uuid primary key default gen_random_uuid(),
  strategy_id  uuid not null references public.strategies (id) on delete cascade,
  user_id      uuid not null,
  position     smallint not null check (position between 1 and 5),
  name         text not null check (length(trim(name)) > 0),
  description  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (strategy_id, position)
);

create index if not exists pillars_strategy_id_idx on public.pillars (strategy_id);
create index if not exists pillars_user_id_idx     on public.pillars (user_id);

-- ---------------------------------------------------------------------------
-- slots
-- ---------------------------------------------------------------------------
-- One dated slot per post in the 12 weeks: 36, 48 or 60 rows per strategy.
--
-- theme, angle, format and brief are laid out for every slot at generation
-- (spec §4.2: "each carrying a date, pillar, theme, angle, format and a
-- one-line brief"). hook, key_points, proof_point and cta are the FULL brief,
-- written only for the coming week (spec §4.2: "only the next week's slots
-- are drafted in full") — null/empty until then, and `status` flips to
-- 'briefed' when they are written. Post text is Milestone 5's, behind the
-- paywall (spec §1.2), which is why "drafted in full" here means a brief and
-- not a post (Ruling R-M3-4).
--
-- format mirrors SLOT_FORMATS and status mirrors SLOT_STATUSES in
-- src/lib/strategy/vocabulary.ts. Keep them in step. Milestone 5 widens
-- status in its own migration.
--
-- Two uniqueness rules: (strategy, week, position) is the logical identity,
-- and (strategy, scheduled_on) catches a date-arithmetic bug that would put
-- two posts on one day — cadence is at most 5 across 5 distinct weekdays, so
-- a collision is always a bug.
create table if not exists public.slots (
  id            uuid primary key default gen_random_uuid(),
  strategy_id   uuid not null references public.strategies (id) on delete cascade,
  user_id       uuid not null,
  pillar_id     uuid not null references public.pillars (id) on delete cascade,
  week_index    smallint not null check (week_index between 1 and 12),
  position      smallint not null check (position between 1 and 5),
  scheduled_on  date not null,
  theme         text not null check (length(trim(theme)) > 0),
  angle         text not null,
  format        text not null
                  check (format in ('story','how-to','list','contrarian','case-study','question')),
  brief         text not null,
  hook          text,
  key_points    text[] not null default '{}',
  proof_point   text,
  cta           text,
  status        text not null default 'planned'
                  check (status in ('planned','briefed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (strategy_id, week_index, position),
  unique (strategy_id, scheduled_on)
);

create index if not exists slots_strategy_id_idx on public.slots (strategy_id);
create index if not exists slots_pillar_id_idx   on public.slots (pillar_id);
-- The dashboard's "next scheduled slot" query: one user's slots from today on.
create index if not exists slots_user_id_scheduled_on_idx on public.slots (user_id, scheduled_on);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.strategies enable row level security;
alter table public.strategies force row level security;
alter table public.pillars    enable row level security;
alter table public.pillars    force row level security;
alter table public.slots      enable row level security;
alter table public.slots      force row level security;

-- strategies
drop policy if exists "strategies_select_own" on public.strategies;
create policy "strategies_select_own"
  on public.strategies for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "strategies_insert_own" on public.strategies;
create policy "strategies_insert_own"
  on public.strategies for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- USING decides which rows may be updated; WITH CHECK stops a user reassigning
-- a row to someone else's user_id.
drop policy if exists "strategies_update_own" on public.strategies;
create policy "strategies_update_own"
  on public.strategies for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "strategies_delete_own" on public.strategies;
create policy "strategies_delete_own"
  on public.strategies for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- pillars
drop policy if exists "pillars_select_own" on public.pillars;
create policy "pillars_select_own"
  on public.pillars for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "pillars_insert_own" on public.pillars;
create policy "pillars_insert_own"
  on public.pillars for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "pillars_update_own" on public.pillars;
create policy "pillars_update_own"
  on public.pillars for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "pillars_delete_own" on public.pillars;
create policy "pillars_delete_own"
  on public.pillars for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- slots
drop policy if exists "slots_select_own" on public.slots;
create policy "slots_select_own"
  on public.slots for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "slots_insert_own" on public.slots;
create policy "slots_insert_own"
  on public.slots for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "slots_update_own" on public.slots;
create policy "slots_update_own"
  on public.slots for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "slots_delete_own" on public.slots;
create policy "slots_delete_own"
  on public.slots for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
-- public.touch_updated_at() already exists from 0001. Attach it; do not
-- redefine it.
drop trigger if exists strategies_touch_updated_at on public.strategies;
create trigger strategies_touch_updated_at
  before update on public.strategies
  for each row execute function public.touch_updated_at();

drop trigger if exists pillars_touch_updated_at on public.pillars;
create trigger pillars_touch_updated_at
  before update on public.pillars
  for each row execute function public.touch_updated_at();

drop trigger if exists slots_touch_updated_at on public.slots;
create trigger slots_touch_updated_at
  before update on public.slots
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Cascade delete
-- ---------------------------------------------------------------------------
-- Deleting the strategy cascades to pillars and slots through their foreign
-- keys, so the one new line below is enough; slots and pillars are listed
-- explicitly anyway so the order of teardown is visible here and does not
-- depend on remembering the FK graph. profiles stays last, as in 0003.
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
