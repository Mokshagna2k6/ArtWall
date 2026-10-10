-- 0019: Codify an index that exists on the dev database but in no migration.
-- Found by diffing the dev catalog against a database built from 0001-0018.
-- Serves the moderation list filtered by any status, newest first.

create index if not exists pw_ugc_status_idx
  on pw_ugc_submissions (status, created_at desc);
