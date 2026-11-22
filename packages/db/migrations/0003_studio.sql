create table if not exists "user" (id text primary key, name text not null, email text not null unique, "emailVerified" boolean not null default false, image text, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null default now());
create table if not exists "session" (id text primary key, "expiresAt" timestamp not null, token text not null unique, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null default now(), "ipAddress" text, "userAgent" text, "userId" text not null);
create table if not exists "account" (id text primary key, "accountId" text not null, "providerId" text not null, "userId" text not null, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamp, "refreshTokenExpiresAt" timestamp, scope text, password text, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null default now());
create table if not exists "verification" (id text primary key, identifier text not null, value text not null, "expiresAt" timestamp not null, "createdAt" timestamp default now(), "updatedAt" timestamp default now());
create table if not exists artworks (id text primary key, "userId" text not null, title text not null, year integer, medium text, status text not null default 'available', "imageUrl" text, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null default now());
create table if not exists contacts (id text primary key, "userId" text not null, name text not null, email text, kind text not null default 'collector', "createdAt" timestamp not null default now());
create index if not exists artworks_user_idx on artworks ("userId", "createdAt");
create index if not exists contacts_user_idx on contacts ("userId", "createdAt");
create table if not exists collections (id text primary key, "userId" text not null, name text not null, description text, "createdAt" timestamp not null default now());
create table if not exists tasks (id text primary key, "userId" text not null, title text not null, status text not null default 'open', "dueAt" timestamp, "createdAt" timestamp not null default now());
-- Guarded because migration 0057 renames collections."userId" -> owner_id and
-- "createdAt" -> created_at. On a FRESH database this runs normally. On a
-- re-run against an already-migrated database, `create table if not exists`
-- above skips, so this line would otherwise execute against the renamed
-- schema and fail with: column "userId" does not exist. (DB-2.13 requires
-- every migration to be re-runnable; 0057 leaves the index 0057 itself
-- rebuilds, so skipping here loses nothing.)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'collections' and column_name = 'userId'
  ) then
    create index if not exists collections_user_idx on collections ("userId", "createdAt");
  end if;
end $$;
create index if not exists tasks_user_idx on tasks ("userId", "createdAt");
create table if not exists sales (id text primary key, "userId" text not null, "contactId" text, "artworkId" text, status text not null default 'lead', amount integer, "createdAt" timestamp not null default now());
create table if not exists documents (id text primary key, "userId" text not null, title text not null, kind text not null default 'certificate', url text, "createdAt" timestamp not null default now());
create table if not exists rooms (id text primary key, "userId" text not null, name text not null, slug text not null, "createdAt" timestamp not null default now());
