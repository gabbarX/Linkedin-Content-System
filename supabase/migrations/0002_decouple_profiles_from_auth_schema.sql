-- Decouple public.profiles from the auth schema.
--
-- Why: profiles.id had `references auth.users (id) on delete cascade`. Prisma
-- cannot introspect a cross-schema foreign key unless `auth` is listed in the
-- datasource's schemas — and listing it drags all 27 Supabase Auth tables into
-- schema.prisma (audit_log_entries, sessions, refresh_tokens, sso_providers,
-- mfa_factors, ...). Prisma's migration diffing would then consider those its
-- to manage, which is prisma/prisma#17734: the engine attempting to drop and
-- recreate auth.users, taking every user and the signup trigger with it.
--
-- Marking a single table external does not help, because the other 26 remain
-- unmarked. So the foreign key is removed and its two guarantees are preserved
-- another way:
--
--   1. "No profile without a user" — already guaranteed without the FK:
--      handle_new_user() is the only thing that inserts into profiles, and it
--      fires from an insert on auth.users. The RLS insert policy additionally
--      requires auth.uid() = id for anyone coming through the Data API.
--
--   2. "Delete the user, delete the profile" — replaced by the explicit
--      after-delete trigger below, which does exactly what ON DELETE CASCADE
--      did.
--
-- The column keeps its uuid type and still holds auth.users.id. What changes is
-- that the database no longer enforces the reference, so the trigger below is
-- load-bearing: do not drop it.

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

-- Replaces ON DELETE CASCADE.
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_user();
