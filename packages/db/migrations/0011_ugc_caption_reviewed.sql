-- Add caption and reviewed_at columns to pw_ugc_submissions.
--
-- The code in ugc.ts stores a user-provided caption on submission and records
-- the moderation timestamp, but neither column existed in the 0009 migration
-- that created the table. Without these columns, submitUgc and moderateUgc
-- fail at runtime.

alter table pw_ugc_submissions add column if not exists caption text;
alter table pw_ugc_submissions add column if not exists reviewed_at timestamptz;
