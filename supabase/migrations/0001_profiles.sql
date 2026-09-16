-- LinkBud profiles: one row per authenticated user.
--
-- Authorization model (see docs/ARCHITECTURE.md):
--   * Prisma queries run as the `postgres` role, which has BYPASSRLS. Ownership
--     on that path is enforced in application code by src/server/db/repositories,
--     where every function takes an explicit userId.
--   * RLS below is NOT decorative. The anon key is public — it ships in the
--     browser bundle — and Supabase's Data API (PostgREST) is reachable with it.
--     These policies are what stop anyone who views source from reading every
--     row over REST. They must never be dropped.
--
-- SQL conventions follow the supabase-postgres-best-practices skill:
--   * auth.uid() wrapped in (select ...) so it is evaluated once, not per row
--   * explicit `to authenticated` rather than relying on a null uid comparison
--   * force row level security, so RLS also applies to the table owner
--   * security definer functions pin an empty search_path and fully qualify names

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

-- Applies RLS to the table owner too. Without this, any connection owning the
-- table silently sees everything.
alter table public.profiles force row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- An UPDATE needs both USING and WITH CHECK: USING decides which rows may be
-- updated, WITH CHECK stops a user reassigning a row's id to someone else.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- Create the profile row automatically on signup.
--
-- security definer with an empty search_path: every name below is fully
-- qualified, so nothing resolves through a caller-controlled search path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
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
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
