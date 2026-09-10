-- ArtWall — physical wall community gallery (F30)
--
-- Migration 0009 created pw_ugc_submissions but not the public gallery table it
-- feeds. The earlier 0008_physical_wall_ugc.sql defined both, but with a shape
-- that never matched the app code or src/lib/db/schema.ts and was never applied
-- to any database, so it was removed. This migration adds only the missing
-- table, in the shape src/lib/db/schema.ts (pwCommunityGallery) and
-- src/features/physical-wall/actions/ugc.ts actually use.
--
-- Approved UGC only. The public wall page reads this table; it holds the
-- approved asset and its attribution, no submission metadata.
--
-- scripts/migrate.mjs strips full-line comments and splits on semicolons, so
-- every statement is flat. No DO $$ ... $$ blocks.

create table if not exists pw_community_gallery (
  id            text        primary key,
  submission_id text        not null references pw_ugc_submissions(id) on delete cascade,
  image_url     text        not null,
  caption       text,
  byline        text,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now()
);

create unique index if not exists pw_community_gallery_submission_idx
  on pw_community_gallery (submission_id);

create index if not exists pw_community_gallery_sort_idx
  on pw_community_gallery (sort_order asc, created_at desc);
