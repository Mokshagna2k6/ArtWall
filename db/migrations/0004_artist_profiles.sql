-- The profile is deliberately separate from Better Auth's `user` record:
-- account credentials remain private, while artists control the public identity
-- they publish to ArtWall.
create table if not exists artist_profiles (
  "userId" text primary key references "user"(id) on delete cascade,
  handle text not null unique,
  "displayName" text not null,
  discipline text,
  location text,
  bio text,
  website text,
  instagram text,
  "avatarUrl" text,
  published boolean not null default false,
  "publishedAt" timestamp,
  "onboardingCompleted" boolean not null default false,
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now(),
  constraint artist_profiles_handle_format check (handle ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create index if not exists artist_profiles_published_idx
  on artist_profiles (published, "updatedAt" desc)
  where published = true;

alter table artworks
  add column if not exists description text,
  add column if not exists dimensions text,
  add column if not exists "imagePublicId" text,
  add column if not exists "isPublic" boolean not null default true;

create index if not exists artworks_public_profile_idx
  on artworks ("userId", "createdAt" desc)
  where "isPublic" = true;
