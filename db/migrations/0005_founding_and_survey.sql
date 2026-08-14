-- ArtWall — signed-in founding artists, and the pain-point survey
--
-- Two changes, both driven by the same decision: joining the wall now requires
-- an account, so a roster row can finally be tied to a real user.
--
--  * `user_id` links a roster entry to the Better Auth `user` that created it.
--    `on delete set null` rather than `cascade`: if someone deletes their
--    account we must not silently vaporise a numbered place and renumber the
--    wall around it. The row stays, the link goes.
--  * `founding_member` is an explicit opt-in. Holding a place and *claiming
--    founding status* are different promises, and the second one has to be
--    asked for rather than assumed.
--
-- The survey is its own table, not more columns on the roster. Someone can
-- answer it without joining, and an artist can answer it more than once as
-- their practice changes — neither fits a one-row-per-email roster.

-- NOTE: scripts/migrate.mjs splits this file on semicolons, so every statement
-- here must be a single flat statement. No DO $$ ... $$ blocks.
alter table waitlist_entries
  add column if not exists user_id text,
  add column if not exists founding_member boolean not null default false;

-- Runs exactly once (the runner records applied files), so an unconditional
-- ADD CONSTRAINT is safe and avoids a procedural block.
alter table waitlist_entries
  add constraint waitlist_entries_user_id_fkey
  foreign key (user_id) references "user"(id) on delete set null;

create index if not exists waitlist_entries_user_idx
  on waitlist_entries (user_id);

-- Who has claimed founding status, in roster order.
create index if not exists waitlist_entries_founding_idx
  on waitlist_entries (founder_number)
  where founding_member = true;

-- The pain-point survey.
--
-- `pain_points` is a text[] rather than a join table: the option list is short,
-- fixed, and only ever read as a whole. A join table here would be three
-- queries and a migration every time we reword an option.
create table if not exists survey_responses (
  id              bigint generated always as identity primary key,
  user_id         text,
  email           text,
  role            text        not null default 'artist'
                    check (role in ('artist', 'collector', 'gallery', 'other')),
  practice        text,
  city            text,
  pain_points     text[]      not null default '{}',
  biggest_problem text,
  fair_commission text,
  earns_from_art  text,
  notes           text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists survey_responses_created_at_idx
  on survey_responses (created_at desc);

create index if not exists survey_responses_user_idx
  on survey_responses (user_id);
