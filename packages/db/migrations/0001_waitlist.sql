-- ArtWall — founding roster
--
-- Run against your Neon branch:
--   psql "$DATABASE_URL" -f db/migrations/0001_waitlist.sql
--
-- Design notes:
--  * `founder_number` is a generated identity, so the roster order is assigned
--    by the database rather than derived from a count. A count-based number is
--    racy: two artists submitting in the same second would both be told they
--    are #42.
--  * `email` is unique and citext-lowered at the application layer, so a repeat
--    submission returns the artist's existing number instead of creating a
--    second place for the same person.
--  * No location, IP, or tracking columns. We store what is needed to hold a
--    place and write back, and nothing else.

create table if not exists waitlist_entries (
  founder_number bigint generated always as identity primary key,
  name           text        not null,
  email          text        not null unique,
  role           text        not null check (role in ('artist', 'collector')),
  practice       text,
  city           text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

-- Supports the "how many have joined" lookup on the join page.
create index if not exists waitlist_entries_created_at_idx
  on waitlist_entries (created_at desc);
