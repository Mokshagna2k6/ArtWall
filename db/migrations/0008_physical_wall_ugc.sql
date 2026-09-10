-- ArtWall — physical wall UGC: selfie submissions and community gallery
--
-- F25 and F30. Two tables: one for the raw submission, one for the approved
-- public row. The split is the privacy story: a rejected submission is deleted
-- entirely, and the public table never contains anything that has not passed
-- moderation.
--
-- NOTE: scripts/migrate.mjs strips full-line comments and splits on semicolons,
-- so every statement must be flat. No DO $$ ... $$ blocks.

-- ── UGC submissions (F25) ────────────────────────────────────────────────────
-- A visitor uploads a selfie. It lands here as pending, is reviewed by staff,
-- and either moves to the public gallery or is deleted.
--
-- `consent` is a literal true/false, not a defaulted flag: no consent means
-- the row is never written, so the schema enforces the DPDP position rather
-- than trusting the application layer.
--
-- `adult_confirmed` is required for the same reason: a minor in a photo is a
-- different legal obligation, and the schema makes it impossible to forget.
create table if not exists pw_ugc_submissions (
  id               text        primary key,
  visit_id         text        references pw_visits(id) on delete set null,
  artist_id        text        references "user"(id) on delete set null,
  caption          text        not null default '',
  image_url        text        not null,
  thumbnail_url    text,
  status           text        not null default 'pending',
  consent          boolean     not null,
  adult_confirmed  boolean     not null,
  reviewed_by      text        references "user"(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint pw_ugc_status_check check (status in ('pending', 'approved', 'removed'))
);

create index if not exists pw_ugc_status_idx
  on pw_ugc_submissions (status, created_at desc);

create index if not exists pw_ugc_visit_idx
  on pw_ugc_submissions (visit_id);

-- ── Community gallery (F30) ──────────────────────────────────────────────────
-- Approved UGC only. The spec is explicit: "Only approved UGC is public."
-- This table is what the public page reads, and it contains no submission
-- metadata — just the approved asset and its attribution.
create table if not exists pw_community_gallery (
  id            text        primary key,
  submission_id text        not null references pw_ugc_submissions(id) on delete cascade,
  image_url     text        not null,
  caption       text        not null default '',
  byline        text        not null,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now()
);

create unique index if not exists pw_community_gallery_submission_idx
  on pw_community_gallery (submission_id);

create index if not exists pw_community_gallery_sort_idx
  on pw_community_gallery (sort_order, created_at desc);
