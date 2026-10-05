-- 0057: pw_notifications.schema_version (BE-3.22).
--
-- "The notification outbox event schema is versioned, so it can later be
-- bridged to a broker without code changes to producers" (F70). A bare
-- integer, starting at 1 - every row written today is version 1 of the shape
-- that already exists (id/user_id/channel/recipient/subject/body/kind/...).
-- A future shape change bumps this for new rows only; a broker bridge reads
-- it to know how to interpret a row without guessing from which columns are
-- populated. No producer changes: queueNotification (the one insert path
-- every caller goes through) stamps it, so every caller is covered for free.

alter table pw_notifications add column if not exists schema_version integer not null default 1;
