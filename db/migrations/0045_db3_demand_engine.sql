-- 0045: Demand Engine signal tables (DB-3.14).
--
-- demand_signals: append-only, event-level. One row per raw signal (a view,
-- a wishlist add, a share, whatever source emits it) — never updated.
-- demand_aggregates: one row per artwork, upserted by the aggregation job.
--
-- Shape matches src/features/demand/aggregate.ts's documented "ASSUMED
-- SCHEMA" exactly (artwork_id/weight/value/recorded_at source;
-- artwork_id/score/threshold_crossed_at/computed_at destination) so that
-- stub's TODO can be resolved by deleting the throw and uncommenting its
-- query, once a per-artwork threshold column/config is wired in.

begin;

create table if not exists demand_signals (
  id bigint generated always as identity primary key,
  artwork_id text not null,
  signal_type text not null, -- 'view' | 'wishlist' | 'share' | 'inquiry' | ...
  weight integer not null,
  value integer not null default 1,
  recorded_at timestamptz not null default now()
);

create index if not exists demand_signals_artwork_idx
  on demand_signals (artwork_id, recorded_at desc);

create or replace function demand_signals_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'demand_signals is append-only: % not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists demand_signals_no_update on demand_signals;
create trigger demand_signals_no_update
  before update or delete on demand_signals
  for each row execute function demand_signals_append_only();

create table if not exists demand_aggregates (
  artwork_id text primary key,
  score integer not null default 0,
  threshold_crossed_at timestamptz,
  computed_at timestamptz not null default now()
);

-- Aggregation view: current per-artwork totals computed live from the raw
-- signal log, for verifying the aggregate table against ground truth (and
-- for callers that would rather read a view than the job's cached table).
create or replace view demand_signal_totals as
  select artwork_id, sum(weight * value) as raw_score, count(*) as signal_count, max(recorded_at) as last_signal_at
  from demand_signals
  group by artwork_id;

commit;
