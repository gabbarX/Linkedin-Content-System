-- LinkBud Milestone 2: onboarding.
--
-- Three tables from spec §5 — business_profiles, voice_profiles,
-- writing_samples — plus a resumable interview draft on profiles.
--
-- Conventions follow 0001 exactly; read that file first if anything here looks
-- unexplained. In particular: RLS is enabled AND forced on every table, every
-- policy is scoped `to authenticated`, and auth.uid() is wrapped in (select ...)
-- so it evaluates once per statement rather than once per row.
--
-- Why RLS still matters even though Prisma bypasses it: the anon key ships in
-- the browser bundle and Supabase's Data API is reachable with it. These
-- policies are what stop anyone who views source from reading every row over
-- REST. Ownership on the Prisma path is enforced by src/server/db/repositories,
-- where every function takes an explicit userId.
--
-- No foreign key to auth.users, for the reason recorded in 0002: a cross-schema
-- FK forces Prisma to introspect all 27 Supabase Auth tables, which its
-- migration engine would then treat as its own to manage. user_id holds
-- auth.users.id. Rows are cleaned up by the cascade delete below.

-- ---------------------------------------------------------------------------
-- business_profiles
-- ---------------------------------------------------------------------------
-- One per user: v1 is a single solo coach with a single LinkedIn profile
-- (spec §1.1), so `unique` is the correct constraint, not a limitation to work
-- around later.
--
-- offer, icp and transformation are NOT NULL on purpose. A row exists here only
-- once the interview has completed and validated, so every consumer from
-- Milestone 3's generateStrategy() onward gets `string`, not `string | null`.
-- Partial answers live in profiles.interview_draft until then.
create table if not exists public.business_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique,
  offer          text not null check (length(trim(offer)) > 0),
  price_band     text,
  icp            text not null check (length(trim(icp)) > 0),
  transformation text not null check (length(trim(transformation)) > 0),
  proof          text,
  point_of_view  text,
  taboos         text[] not null default '{}',
  cta_target     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- voice_profiles
-- ---------------------------------------------------------------------------
-- The numeric fields are measured from the samples in code; the enumerated
-- fields are the model's judgement (spec §8, amended 2026-09-16). The check
-- constraints exist because those values arrive from a language model: a
-- response of 'sometimes' for emoji_policy must fail at the database rather
-- than reach the writer in Milestone 5 as a value it silently misreads.
--
-- Every enumerated field carries a default, so a derivation that fails
-- partway still leaves a usable, editable profile rather than a half-null row.
create table if not exists public.voice_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique,

  -- Measured, not inferred. Null until the first derivation runs.
  avg_sentence_length numeric(5,2) check (avg_sentence_length >= 0),
  max_sentence_length integer      check (max_sentence_length >= 0),
  avg_paragraph_lines numeric(5,2) check (avg_paragraph_lines >= 0),

  sentence_rhythm     text not null default 'varied'
                        check (sentence_rhythm in
                          ('short-punchy','varied','long-flowing')),
  line_break_style    text not null default 'grouped'
                        check (line_break_style in
                          ('single-line','grouped','dense')),
  emoji_policy        text not null default 'none'
                        check (emoji_policy in ('none','sparing','frequent')),
  hashtag_policy      text not null default 'none'
                        check (hashtag_policy in ('none','sparing','frequent')),
  pov_strength        text not null default 'balanced'
                        check (pov_strength in
                          ('measured','balanced','contrarian')),
  humour_level        text not null default 'none'
                        check (humour_level in ('none','dry','playful')),
  formality           text not null default 'conversational'
                        check (formality in
                          ('formal','conversational','casual')),

  opener_patterns     text[] not null default '{}',
  closer_patterns     text[] not null default '{}',
  vocabulary_markers  text[] not null default '{}',
  banned_phrases      text[] not null default '{}',

  derived_at          timestamptz,
  -- Set the moment the user edits any field. A later re-derivation must not
  -- silently overwrite a human decision — that is the whole point of spec
  -- §4.1's "the user has a dial to turn".
  user_edited         boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- writing_samples
-- ---------------------------------------------------------------------------
-- Many per user: spec §4.1 asks for 5–10 pasted posts, or 2 written fresh.
-- That count rule is enforced in application code, not here — a check
-- constraint cannot count sibling rows without a trigger, and the rule is a
-- product decision that will move.
--
-- The counts are stored rather than recomputed. They are the exemplar-matching
-- features Milestone 5 selects on, and recomputing them per read would be a
-- table scan with a text parser attached.
--
-- These are the user's OWN words, pasted by them. Nothing here is fetched from
-- LinkedIn — r_member_social is closed to new access, and scraping is an
-- architectural boundary (docs/LINKEDIN-COMPLIANCE.md). The 48-hour purge rule
-- applies to LinkedIn-returned content and therefore does not apply to this
-- table.
create table if not exists public.writing_samples (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  content       text not null check (length(trim(content)) > 0),
  source        text not null default 'pasted'
                  check (source in ('pasted','written')),
  word_count    integer not null default 0 check (word_count >= 0),
  char_count    integer not null default 0 check (char_count >= 0),
  line_count    integer not null default 0 check (line_count >= 0),
  emoji_count   integer not null default 0 check (emoji_count >= 0),
  hashtag_count integer not null default 0 check (hashtag_count >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists writing_samples_user_id_idx
  on public.writing_samples (user_id);

-- ---------------------------------------------------------------------------
-- profiles.interview_draft
-- ---------------------------------------------------------------------------
-- Partial interview answers, so closing a tab does not cost the user nine
-- questions. Cleared when the interview completes and business_profiles is
-- written. Deliberately not queryable structure: it is read and written whole,
-- for one user, and never filtered on.
alter table public.profiles
  add column if not exists interview_draft jsonb
    check (interview_draft is null or jsonb_typeof(interview_draft) = 'object');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.business_profiles enable row level security;
alter table public.business_profiles force row level security;
alter table public.voice_profiles    enable row level security;
alter table public.voice_profiles    force row level security;
alter table public.writing_samples   enable row level security;
alter table public.writing_samples   force row level security;

-- business_profiles
drop policy if exists "business_profiles_select_own" on public.business_profiles;
create policy "business_profiles_select_own"
  on public.business_profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "business_profiles_insert_own" on public.business_profiles;
create policy "business_profiles_insert_own"
  on public.business_profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- USING decides which rows may be updated; WITH CHECK stops a user reassigning
-- a row to someone else's user_id.
drop policy if exists "business_profiles_update_own" on public.business_profiles;
create policy "business_profiles_update_own"
  on public.business_profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "business_profiles_delete_own" on public.business_profiles;
create policy "business_profiles_delete_own"
  on public.business_profiles for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- voice_profiles
drop policy if exists "voice_profiles_select_own" on public.voice_profiles;
create policy "voice_profiles_select_own"
  on public.voice_profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "voice_profiles_insert_own" on public.voice_profiles;
create policy "voice_profiles_insert_own"
  on public.voice_profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "voice_profiles_update_own" on public.voice_profiles;
create policy "voice_profiles_update_own"
  on public.voice_profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "voice_profiles_delete_own" on public.voice_profiles;
create policy "voice_profiles_delete_own"
  on public.voice_profiles for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- writing_samples. No update policy: a sample is the user's own pasted text,
-- created and deleted but never edited. Editing one would silently invalidate
-- the stored counts and the voice profile derived from them.
drop policy if exists "writing_samples_select_own" on public.writing_samples;
create policy "writing_samples_select_own"
  on public.writing_samples for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "writing_samples_insert_own" on public.writing_samples;
create policy "writing_samples_insert_own"
  on public.writing_samples for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "writing_samples_delete_own" on public.writing_samples;
create policy "writing_samples_delete_own"
  on public.writing_samples for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
-- public.touch_updated_at() already exists from 0001. Attach it; do not
-- redefine it. writing_samples has no updated_at — rows are immutable.
drop trigger if exists business_profiles_touch_updated_at on public.business_profiles;
create trigger business_profiles_touch_updated_at
  before update on public.business_profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists voice_profiles_touch_updated_at on public.voice_profiles;
create trigger voice_profiles_touch_updated_at
  before update on public.voice_profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Cascade delete
-- ---------------------------------------------------------------------------
-- These tables carry no FK to auth.users, so deleting a user would otherwise
-- orphan their rows. 0002's handle_deleted_user() already removes the profile;
-- extend it to remove everything else the user owns.
--
-- Note the ordering: profiles last, so a failure partway through does not leave
-- a user with a profile row but no data. The whole trigger body is one
-- transaction, so this is belt-and-braces rather than load-bearing.
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.writing_samples   where user_id = old.id;
  delete from public.voice_profiles    where user_id = old.id;
  delete from public.business_profiles where user_id = old.id;
  delete from public.profiles          where id      = old.id;
  return old;
end;
$$;
