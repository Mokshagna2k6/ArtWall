-- 0028: shared fixed-window rate limiter (PERF-1.01/1.02).
--
-- One row per (hashed) key. src/lib/rate-limit.ts bumps the row with a single
-- INSERT ... ON CONFLICT DO UPDATE, so the row lock serialises concurrent hits
-- from every serverless instance. Keys are sha256 digests: no raw IP address or
-- email is ever stored. Expired rows are swept by the data-retention cron.
create table if not exists rate_limits (
  key      text primary key,
  count    integer not null,
  reset_at timestamptz not null
);
create index if not exists rate_limits_reset_at_idx on rate_limits (reset_at);
