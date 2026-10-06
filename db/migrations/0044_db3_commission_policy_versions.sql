-- 0044: Versioned commission-split policy (DB-3.04) + FK columns to it (DB-3.05).
--
-- commission_policies (0043, BE-3.09/3.10) is a single-rate-per-kind table —
-- one row per rate family (curator_commission | mint_royalty |
-- platform_commission), read by two live call sites
-- (src/features/coa/actions.ts, src/features/curators/actions.ts) via
-- getActiveCommissionPolicy(). DB-3.04 literally asks for a different shape:
-- ONE versioned row holding platform + artist + curator + venue + royalty bps
-- simultaneously, immutable once effective, CHECK'd to sum to 10000. That is
-- not a superset or subset of 0043's table — it's a different policy
-- document (a whole-transaction split vs. a single rate) — so this adds a new
-- table instead of reshaping the one two production call sites already rely
-- on (standing rule: do not break existing code).
--
-- commission_policy_version_id FK columns are added to pw_ledger and
-- mint_commitments (DB-3.05) so a future ledger-producing commission flow can
-- snapshot which split version priced it. Nullable + no backfill target:
-- no such flow exists yet in this codebase (see docs/policy-engine.md's
-- "no ledger-producing commission flow exists yet" note), so there is
-- nothing to backfill; existing rows simply have no version.

begin;

create table if not exists commission_policy_versions (
  id text primary key,
  version integer not null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  platform_bps integer not null check (platform_bps >= 0 and platform_bps <= 10000),
  artist_bps integer not null check (artist_bps >= 0 and artist_bps <= 10000),
  curator_bps integer not null check (curator_bps >= 0 and curator_bps <= 10000),
  venue_bps integer not null check (venue_bps >= 0 and venue_bps <= 10000),
  royalty_bps integer not null check (royalty_bps >= 0 and royalty_bps <= 10000),
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint commission_policy_versions_shares_sum_10000
    check (platform_bps + artist_bps + curator_bps + venue_bps + royalty_bps = 10000)
);

create unique index if not exists commission_policy_versions_version_unique
  on commission_policy_versions (version);

-- At most one version has no end date (the currently-effective one). A plain
-- unique index on effective_to would not work here: NULL is never equal to
-- NULL in a btree, so a partial unique index "where effective_to is null"
-- does not actually block a second NULL row (verified: it let two through).
-- Indexing a constant expression instead gives every open row the same key,
-- so a second one collides for real.
create unique index if not exists commission_policy_versions_one_open
  on commission_policy_versions ((true)) where effective_to is null;

-- Immutable once effective: once effective_from has passed, no column may
-- change except effective_to (closing the version out when superseded).
create or replace function commission_policy_versions_immutable() returns trigger
language plpgsql as $$
begin
  if old.effective_from <= now() then
    if new.version is distinct from old.version
      or new.effective_from is distinct from old.effective_from
      or new.platform_bps is distinct from old.platform_bps
      or new.artist_bps is distinct from old.artist_bps
      or new.curator_bps is distinct from old.curator_bps
      or new.venue_bps is distinct from old.venue_bps
      or new.royalty_bps is distinct from old.royalty_bps
    then
      raise exception 'commission_policy_versions: row % is effective and immutable except for effective_to', old.id
        using errcode = 'restrict_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists commission_policy_versions_no_mutate on commission_policy_versions;
create trigger commission_policy_versions_no_mutate
  before update on commission_policy_versions
  for each row execute function commission_policy_versions_immutable();

drop trigger if exists commission_policy_versions_no_delete on commission_policy_versions;
create or replace function commission_policy_versions_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'commission_policy_versions rows are never deleted' using errcode = 'restrict_violation';
end;
$$;
create trigger commission_policy_versions_no_delete
  before delete on commission_policy_versions
  for each row execute function commission_policy_versions_no_delete();

-- Seed version 1 using the existing active rates as a starting split: curator
-- commission (10%) and mint royalty (4%) carried over from 0043's seed,
-- platform takes a nominal placeholder share, artist takes the remainder.
insert into commission_policy_versions
  (id, version, platform_bps, artist_bps, curator_bps, venue_bps, royalty_bps, note)
values
  ('cpv_v1', 1, 500, 8100, 1000, 0, 400, 'Initial split: carries over curator_commission (10%) and mint_royalty (4%) from commission_policies; platform/artist/venue shares are placeholders pending real Bible figures.')
on conflict (id) do nothing;

-- DB-3.05: snapshot which split version priced a ledger entry / mint
-- commitment. Nullable — no writer sets this yet (no commission-splitting
-- ledger flow exists in this codebase today); future code should set it from
-- the currently-open commission_policy_versions row at write time.
alter table pw_ledger add column if not exists commission_policy_version_id text
  references commission_policy_versions (id) on delete restrict;
alter table mint_commitments add column if not exists commission_policy_version_id text
  references commission_policy_versions (id) on delete restrict;

create index if not exists pw_ledger_commission_policy_version_idx
  on pw_ledger (commission_policy_version_id) where commission_policy_version_id is not null;
create index if not exists mint_commitments_commission_policy_version_idx
  on mint_commitments (commission_policy_version_id) where commission_policy_version_id is not null;

commit;
