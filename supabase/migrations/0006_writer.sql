-- LinkBud Milestone 5: the writer.
--
-- Two tables from spec §5 — posts and post_variants. Conventions follow 0003
-- and 0004 exactly; read those first if anything here looks unexplained. RLS
-- is enabled AND forced on both, every policy is scoped `to authenticated`,
-- and auth.uid() is wrapped in (select ...) so it evaluates once per statement
-- rather than once per row.
--
-- user_id is denormalised onto post_variants even though it is reachable
-- through posts, for the same two reasons as pillars and slots in 0004: the
-- RLS policy stays a single equality with no join, and the repository can
-- scope every query on user_id directly rather than trusting a join to do it.
--
-- Everything in these tables is LinkBud's own generated content. Nothing is
-- fetched from LinkedIn, so the 48-hour purge rule
-- (docs/LINKEDIN-COMPLIANCE.md) does not apply here. linkedin_urn below is the
-- one column that will hold a LinkedIn-returned value, and a URN is explicitly
-- permitted to be kept: "persist our own generated content, post URNs and
-- numeric metrics".

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
-- One post per slot (Ruling R-M5-3), enforced by the partial unique index
-- below rather than a column constraint: slot_id is nullable, and the index
-- states the intent exactly -- attached posts are unique per slot, detached
-- ones are not constrained at all.
--
-- **slot_id is nullable, with on delete set null, and that is load-bearing**
-- (Ruling R-M5-4). replaceStrategy deletes every slot and recreates them when a
-- user regenerates their strategy. A cascade here would silently destroy drafts
-- the customer had written; `not null` would make the regenerate fail with a
-- constraint error. Neither is acceptable -- docs/BACKLOG.md flagged this as
-- "decide before the FK is written". Instead the post survives the slot,
-- detached, and stays readable on /posts.
--
-- The three slot_* columns are that survival mechanism: a snapshot taken when
-- the post is created, so a detached post can still say what it was for and
-- when it was meant to go out. They are deliberately NOT kept in step with the
-- slot afterwards -- they describe the slot as it was when the post was
-- written, which is the only version the post's text was ever about.
--
-- The brief_* columns are structured rather than jsonb, following the
-- Milestone 2 decision recorded in TASKS.md, so the database can reject a blank
-- hook or CTA rather than storing one and finding out at render time. They
-- mirror slots' own briefed columns. The brief is persisted the moment its
-- model call returns, BEFORE the three variant calls run (Ruling R-M5-9), so a
-- variant failure does not throw away a call that was already billed.
--
-- status carries all five values from spec §5, but **Milestone 5 only ever
-- writes 'draft' and 'approved'** (Ruling R-M5-5). The other three are here so
-- Milestone 6 needs no migration to publish.
--
-- **`approved` is not authority to publish.** It records that the user finished
-- writing and marked the text ready. It does not license anything to post it:
-- every publish is a user-initiated tap at publish time
-- (docs/LINKEDIN-COMPLIANCE.md §3 -- "the user pre-approved it" is not a human
-- tap). Editing an approved post returns it to 'draft', so `approved` always
-- describes the exact text that was reviewed. If you are implementing Milestone
-- 6 and reading this because you want a queue of approved posts to publish on a
-- timer: that is precisely what the compliance document forbids.
create table if not exists public.posts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null,
  slot_id                uuid references public.slots (id) on delete set null,

  -- Snapshot of the slot at creation. Survives the slot being deleted.
  slot_theme             text not null check (length(trim(slot_theme)) > 0),
  slot_format            text not null
                           check (slot_format in ('story','how-to','list','contrarian','case-study','question')),
  slot_scheduled_on      date,

  -- The brief this post is written against.
  brief_angle            text not null check (length(trim(brief_angle)) > 0),
  brief_hook             text not null check (length(trim(brief_hook)) > 0),
  brief_key_points       text[] not null default '{}',
  brief_proof            text,
  brief_cta              text not null check (length(trim(brief_cta)) > 0),

  -- Which variant the user picked, and what they made of it.
  variant_index          smallint check (variant_index between 0 and 2),
  final_text             text,
  -- A pending polish awaiting accept or discard. Cleared either way. Persisted
  -- rather than held in React state so a closed tab does not throw away a model
  -- call that was already paid for.
  polished_text          text,

  status                 text not null default 'draft'
                           check (status in ('draft','approved','scheduled','published','failed')),
  approved_at            timestamptz,

  -- Preference signals for Milestone 9 (Ruling R-M5-8). Computed in code at
  -- save time by src/lib/post/signals.ts -- never by a model, and never against
  -- text fetched back from LinkedIn. docs/LINKEDIN-COMPLIANCE.md §4 names that
  -- trap specifically: the diff is our generated text against our final text,
  -- both of which are ours to keep indefinitely.
  borrowed_from_variants smallint[] not null default '{}',
  borrowed_char_count    integer not null default 0 check (borrowed_char_count >= 0),
  edit_ratio             numeric(4,3) check (edit_ratio between 0 and 1),
  polish_outcome         text check (polish_outcome in ('accepted','discarded')),

  -- Milestone 6 writes this. A post URN is not social content and may be kept.
  linkedin_urn           text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- A post cannot leave 'draft' without text. Guards the state machine in the
  -- database rather than trusting every future caller to check.
  constraint posts_non_draft_has_text
    check (status = 'draft' or final_text is not null)
);

-- Attached posts are unique per slot; detached ones are unconstrained.
create unique index if not exists posts_slot_id_key
  on public.posts (slot_id) where slot_id is not null;

create index if not exists posts_user_id_idx on public.posts (user_id);
create index if not exists posts_user_scheduled_idx
  on public.posts (user_id, slot_scheduled_on);

drop trigger if exists posts_touch_updated_at on public.posts;
create trigger posts_touch_updated_at
  before update on public.posts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- post_variants
-- ---------------------------------------------------------------------------
-- The three generated drafts per post (spec §5), each carrying a named approach
-- rather than being one of three samples of the same prompt (Ruling R-M5-2).
-- The approach is what makes posts.variant_index a learnable signal: index 1
-- means story-forward on every post, so Milestone 9 can ask "which approach
-- wins for this format" and get an answer. Three rolls of one prompt would make
-- the index mean something different every time.
--
-- Two uniqueness rules, saying different things: (post_id, variant_index) is
-- the logical identity, and (post_id, approach) is what stops a regeneration
-- writing hook-forward twice and no proof-forward at all.
--
-- **No update policy below, deliberately.** Same reasoning as writing_samples:
-- these rows are the record of what the model actually produced. If they could
-- be edited afterwards, the borrowed-span signal computed against them -- and
-- therefore Milestone 9's whole input -- becomes fiction. They are created and
-- deleted, never edited.
create table if not exists public.post_variants (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  post_id        uuid not null references public.posts (id) on delete cascade,
  variant_index  smallint not null check (variant_index between 0 and 2),
  approach       text not null
                   check (approach in ('hook-forward','story-forward','proof-forward')),
  content        text not null check (length(trim(content)) > 0),
  -- Code points, matching src/lib/post/measure.ts. Stored rather than
  -- recomputed, for the same reason writing_samples stores its counts.
  char_count     integer not null default 0 check (char_count >= 0),
  created_at     timestamptz not null default now(),
  unique (post_id, variant_index),
  unique (post_id, approach)
);

create index if not exists post_variants_post_id_idx on public.post_variants (post_id);
create index if not exists post_variants_user_id_idx on public.post_variants (user_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.posts         enable row level security;
alter table public.posts         force  row level security;
alter table public.post_variants enable row level security;
alter table public.post_variants force  row level security;

-- posts: the full four, like every table except subscriptions.
drop policy if exists "posts_select_own" on public.posts;
create policy "posts_select_own"
  on public.posts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- USING decides which rows may be updated; WITH CHECK stops a user reassigning
-- a row to someone else's user_id.
drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
  on public.posts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own"
  on public.posts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- post_variants: three policies, not four. There is no update policy, and that
-- is the point -- see the table comment above.
drop policy if exists "post_variants_select_own" on public.post_variants;
create policy "post_variants_select_own"
  on public.post_variants for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "post_variants_insert_own" on public.post_variants;
create policy "post_variants_insert_own"
  on public.post_variants for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "post_variants_delete_own" on public.post_variants;
create policy "post_variants_delete_own"
  on public.post_variants for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Cascade delete on account deletion
-- ---------------------------------------------------------------------------
-- Replaces the version in 0005. post_variants before posts, and posts before
-- slots: post_variants cascades from posts, and deleting slots first would
-- detach every post (set null) on the way past rather than delete it.
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_variants     where user_id = old.id;
  delete from public.posts             where user_id = old.id;
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
