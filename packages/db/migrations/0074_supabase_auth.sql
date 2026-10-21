-- 0074: move authentication to Supabase Auth.
--
-- better-auth owned four tables (created in 0003_studio.sql): "user",
-- "session", "account", "verification". Supabase Auth owns `auth.users`,
-- `auth.sessions` and `auth.identities` instead, in a schema we do not control.
--
-- ## Why "user" survives
--
-- `public."user"` is NOT dropped. 26 tables carry a `userId` referencing it,
-- and it holds ten columns Supabase Auth knows nothing about — `role`,
-- `onboardingPersona`, `foundingMember`, `identityVerified`,
-- `artistVerificationStatus`, `ageDeclaredAdult`, `nomineeName`,
-- `nomineeContact`, `verifiedAt`, `verificationMethod`. Those are the
-- product's own three identity axes (AGENTS.md: access tier, persona, admin
-- roles) and must not be collapsed into auth metadata.
--
-- So "user" becomes a pure profile table whose `text` id holds the same uuid
-- as `auth.users.id`, kept in step by the triggers below. Nothing else in the
-- schema has to change.
--
-- ## Why "session"/"account"/"verification" are dropped
--
-- Supabase Auth replaces all three outright. Keeping them would leave three
-- tables holding stale credential material (`account.password` carries
-- better-auth's scrypt hashes) that nothing reads — a liability, not a backup.
--
-- ## Runs on plain Postgres too
--
-- CI applies every migration to a bare `postgres:17` (four jobs in
-- .github/workflows/ci.yml), which has no `auth` schema. Everything that
-- depends on `auth.users` — the FK, the triggers, the RLS policies that call
-- `auth.uid()` — is therefore guarded on that schema existing. On a real
-- Supabase project all of it applies; on bare Postgres the retype and the
-- table drops still happen, so the resulting schema is identical except for
-- the Supabase-owned links. Without this guard, 0074 would fail every CI job.
--
-- ## Data loss, accepted
--
-- better-auth hashes passwords with scrypt in its own format; Supabase Auth
-- imports bcrypt/argon2/pbkdf2 and cannot read it. Existing credentials cannot
-- be carried over. This was an explicit decision (user, 2026-10-21; see
-- docs/plans/PRODUCTION_DECISIONS.md decision 2): this migration targets a
-- fresh Supabase project with no users to preserve. Run against a database
-- holding real users, it removes their ability to sign in.

begin;

-- ---------------------------------------------------------------------------
-- 1. "user".id stays `text`. It holds the auth.users uuid as a string.
-- ---------------------------------------------------------------------------
-- An earlier draft retyped this to `uuid` and added an FK to auth.users. Both
-- were wrong: 55 foreign keys across 10 migrations reference "user"(id) as
-- `text` (0004, 0005, 0006, 0007, 0008, 0009, 0013, 0022, 0028, 0032), so
-- Postgres refuses the type change, and a text column cannot reference a uuid
-- one. Retyping all 55 dependents would be a far larger and riskier migration
-- for no behavioural gain.
--
-- Keeping `text` costs nothing: `getSessionUser()` stores `claims.sub`, which
-- is the uuid as a string, so every existing join and comparison still works
-- untouched.
--
-- The consequence is that there is NO database-level FK to auth.users, so
-- `on delete cascade` does not apply: deleting a Supabase auth user leaves its
-- profile row behind. The `handle_new_user` trigger below keeps inserts in
-- step; deletion is handled by the app's own erasure path
-- (features/physical-wall/data-rights.ts), which already deletes the profile
-- and its dependents explicitly for DPDP.
--
-- shortcut: no FK to auth.users, so an auth-user delete orphans the profile
-- row. Upgrade when "user".id and all 55 dependents move to uuid together.

-- ---------------------------------------------------------------------------
-- 2. Supabase-only wiring: FK, sync triggers, RLS
-- ---------------------------------------------------------------------------
do $do$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    raise notice '0074: no auth schema — skipping Supabase FK, triggers and RLS (plain Postgres, e.g. CI).';
    return;
  end if;

  -- Keep "user" in step with auth.users on insert.
  --
  -- `security definer` because this writes to public."user" while running as
  -- the auth system during sign-up. `set search_path = ''` with fully
  -- qualified names throughout: a mutable search_path on a security-definer
  -- function is a privilege-escalation route.
  --
  -- `coalesce` on name is load-bearing: "user".name is NOT NULL, and an OAuth
  -- provider or an admin-created user may supply none. Without it the insert
  -- violates the constraint and — because this runs inside the sign-up
  -- transaction — the sign-up itself fails. Supabase's docs call this out:
  -- a failing trigger blocks signups.
  create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $fn$
  begin
    insert into public."user" (id, name, email, "emailVerified")
    values (
      -- ::text because "user".id is text and auth.users.id is uuid (section 1).
      new.id::text,
      coalesce(
        new.raw_user_meta_data ->> 'name',
        new.raw_user_meta_data ->> 'full_name',
        split_part(coalesce(new.email, ''), '@', 1),
        ''
      ),
      coalesce(new.email, ''),
      new.email_confirmed_at is not null
    )
    -- A profile row can already exist when an existing email signs in through
    -- a second provider. Refresh only what auth owns; never touch
    -- role/persona/verification here.
    on conflict (id) do update
      set email = excluded.email,
          "emailVerified" = excluded."emailVerified",
          "updatedAt" = now();
    return new;
  end;
  $fn$;

  -- The Auth service runs as `supabase_auth_admin`, a role with no rights on
  -- `public` by default. Without these grants the trigger raises
  -- "permission denied for schema public" INSIDE the sign-up transaction, and
  -- Supabase returns a bare "Database error creating new user" — the function
  -- being `security definer` is not enough, because the role must still be
  -- able to reach the schema and fire the trigger in the first place.
  -- (Observed on this project before these grants were added.)
  grant usage on schema public to supabase_auth_admin;
  grant select, insert, update on public."user" to supabase_auth_admin;

  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

  -- Mirror later email confirmation / email change onto the profile row.
  create or replace function public.handle_user_updated()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $fn$
  begin
    update public."user"
       set email = coalesce(new.email, email),
           "emailVerified" = new.email_confirmed_at is not null,
           "updatedAt" = now()
     where id = new.id::text;
    return new;
  end;
  $fn$;

  drop trigger if exists on_auth_user_updated on auth.users;
  create trigger on_auth_user_updated
    after update of email, email_confirmed_at on auth.users
    for each row execute function public.handle_user_updated();

  -- RLS on "user" — a backstop, NOT the gate.
  --
  -- Authorization in this app is enforced in application code
  -- (features/physical-wall/authorize.ts, default-deny). That stays the gate.
  -- This is the database-level second line of defense that packages/db/rls/
  -- previously only described.
  --
  -- Note what is deliberately absent: no policy lets a user update their own
  -- `role`, `onboardingPersona` or verification columns. Those are
  -- privilege-bearing — a self-service UPDATE policy covering them would let
  -- any signed-in user make themselves an admin. They are written only by
  -- server-side code using the service-role client, which bypasses RLS.
  alter table public."user" enable row level security;

  -- The sign-up trigger inserts as `supabase_auth_admin`, which does NOT own
  -- this table, so RLS applies to it. `security definer` does not exempt the
  -- INSERT from policy checks, and during sign-up `auth.uid()` is still null —
  -- so with only the two self-service policies below, every insert was denied
  -- and Supabase returned a bare "Database error creating new user".
  -- (Diagnosed on this project: dropping the trigger made sign-up succeed.)
  --
  -- This policy is scoped to that one role, so it widens nothing for end
  -- users: `anon` and `authenticated` still only get the two policies below.
  drop policy if exists user_auth_admin_write on public."user";
  create policy user_auth_admin_write on public."user"
    to supabase_auth_admin
    using (true) with check (true);

  drop policy if exists user_select_own on public."user";
  create policy user_select_own on public."user"
    for select using (auth.uid()::text = id);

  drop policy if exists user_update_own_profile on public."user";
  create policy user_update_own_profile on public."user"
    for update using (auth.uid()::text = id)
    with check (auth.uid()::text = id);
end
$do$;

-- ---------------------------------------------------------------------------
-- 3. "session" / "account" / "verification" are KEPT, deliberately
-- ---------------------------------------------------------------------------
-- An earlier draft dropped all three. That breaks the DPDP right-to-erasure
-- path: `eraseUser` in features/physical-wall/data-rights.ts deletes from all
-- three by name (lines 213-215), and its test asserts the deletes happen
-- (__tests__/dpdp.db.test.ts). A dropped table turns a legal-compliance flow
-- into a runtime error.
--
-- They are now empty and unused — Supabase Auth keeps sessions in
-- `auth.sessions` and identities in `auth.identities`, and nothing writes
-- these any more. Leaving three empty tables in place costs nothing; dropping
-- them means first rewriting the erasure path and its test, which is a
-- separate change with its own review.
--
-- `account.password` held better-auth scrypt hashes. Those rows are stale
-- credential material, so the data is cleared here even though the table
-- stays. The table being empty is what makes it safe to drop later.
delete from "account";
delete from "session";
delete from "verification";

-- shortcut: three empty better-auth tables kept so the DPDP erasure path and
-- its test keep working. Drop them together with those deletes in data-rights.ts.

commit;
