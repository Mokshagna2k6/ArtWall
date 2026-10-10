-- 0052: the notification outbox gets retry state, backoff and a dead letter (BE-2.12, BE-2.13).
--
--   pending   queued, never tried
--   sending   claimed by a delivery run (claimed_at); stale after 10 minutes → re-claimable
--   retrying  last attempt failed; tried again once next_attempt_at has passed
--   sent      provider accepted it
--   dead      failed max attempts; stays for an admin to look at (overview page)
--   suppressed never to be sent
--
-- 'failed' used to mean "gave up after 3 attempts": those rows become 'dead'.
-- Claiming is one UPDATE over a FOR UPDATE SKIP LOCKED subquery, so two
-- overlapping cron runs get disjoint rows; the provider call carries the row id
-- as its idempotency key, so a re-claimed stale row is not delivered twice.

alter table pw_notifications add column if not exists next_attempt_at timestamptz not null default now();
alter table pw_notifications add column if not exists claimed_at timestamptz;

alter table pw_notifications drop constraint if exists pw_notifications_status_check;
update pw_notifications set status = 'dead' where status = 'failed';
alter table pw_notifications add constraint pw_notifications_status_check check (
  status in ('pending', 'sending', 'retrying', 'sent', 'dead', 'suppressed')
);

create index if not exists pw_notifications_due_idx
  on pw_notifications (next_attempt_at)
  where status in ('pending', 'retrying', 'sending');
