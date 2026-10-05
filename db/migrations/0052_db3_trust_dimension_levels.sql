-- 0052: DB-3.01 — the four remaining graded trust-dimension columns.
--
-- DB-3.01's literal text asks for five columns/tables, each with a CHECK:
-- artist_verification_status, coa_level (0-3), provenance_level (P0-P4),
-- binding_level (B0-B3), transaction_eligibility. coa_level already landed
-- in 0046 (coa_certificates.coa_level, confirmed complete here, untouched).
-- This migration adds the remaining four.
--
-- Design choice, per dimension (see report for the full reasoning):
--
--   artist_verification_status  -> real STORED column on "user". It has
--     exactly one write path today (reviewIdentity in
--     src/features/physical-wall/actions/identity.ts), the same one that
--     already sets identity_verified, so storing it is not a new sync
--     burden — it is the same write, one column wider. A view would need to
--     re-derive "pending vs rejected vs never-submitted" from
--     pw_identity_verifications on every read for a fact that changes only
--     on admin review, which is rare. Stored + CHECK is simplest here.
--
--   binding_level (B0-B3)       -> GENERATED ALWAYS AS ... STORED column on
--     art_tags. Every input (binding_status, bound_at, key_reference,
--     sun_counter_last_seen) lives on the SAME row, so a generated column
--     expression is sufsome — no trigger, no view, Postgres enforces it is
--     always in sync by construction. This is the strongest-guarantee form
--     available and the task's literal "generated column + CHECK" fits
--     exactly.
--
--   provenance_level (P0-P4)    -> VIEW (artwork_provenance_levels), not a
--     stored column. Its inputs span three tables (artworks, coa_certificates,
--     mint_commitments) — a generated column can't reference other tables,
--     and a stored+trigger column here would need triggers on three tables
--     just to keep one column in sync, the exact "drift bug waiting to
--     happen" DB-3.01's own trust.ts comment warns against. A view recomputes
--     live from the same source-of-truth tables loadTrustDimensions already
--     reads. The CHECK is enforced by construction: the CASE expression
--     below only ever emits 0-4, documented here since Postgres views cannot
--     carry a CHECK constraint directly.
--
--   transaction_eligibility     -> VIEW (artwork_transaction_eligibility),
--     same reasoning as provenance_level — it is literally canSecondarySell's
--     three preconditions (published, identity verified, COA issued) read
--     live, not new state. Boolean, not an enum, since the task text does
--     not name a value set for it the way it does for the other four.
--
-- Known incomplete signal (documented, not fabricated):
--   binding_level's B2/B3 tiers are meant (per the Bible's NTAG424/SUN
--   model) to distinguish "a key reference exists" from "a live SUN-counter
--   tap has actually been verified against that key" — i.e. real
--   cryptographic proof of a physical tap, not just a stored reference. This
--   migration can only see key_reference and sun_counter_last_seen as they
--   exist today: both are written at bind time (see art-tags actions), and
--   no Blockchain Phase 3 verification step yet re-validates a SUN counter
--   on each scan and advances it independently of binding. So B3 here means
--   "bound, with a key reference AND at least one observed SUN counter
--   value" — the best real signal available now — not "cryptographically
--   re-verified on every scan". If Blockchain Phase 3 adds a scan-time SUN
--   counter re-validation (monotonic counter check against the tag's actual
--   NTAG424 state), B3 should be redefined against that event instead of
--   mere presence of a last-seen value. Flagged in docs/policy-engine.md too.

begin;

-- ── coa_level drift fix (0046 follow-up, found while building provenance_level) ──
-- 0046 backfilled coa_level once at migration time but nothing keeps it in
-- sync afterwards — every status write path (issue, revoke, the mint-flow API
-- routes under src/app/api/blockchain/certificates/**) sets status and never
-- touches coa_level, so every certificate created or transitioned since 0046
-- silently drifts back to level 0. That is exactly the "drift bug waiting to
-- happen" 0046's own comment warned a *mirrored* column would cause — it
-- happened anyway, just one write path at a time. Root-cause fix: a trigger,
-- so every current and future write path stays correct without each one
-- remembering to set coa_level by hand.
-- revoked/failed are off-ramps, not levels of their own (0046): they keep
-- whatever level the certificate had already reached (OLD.coa_level on an
-- update into one of them), never regress. On insert (no OLD row) they fall
-- back to the status-implies-level mapping same as any other status.
create or replace function coa_certificates_sync_level() returns trigger
language plpgsql as $$
begin
  if new.status in ('revoked', 'failed') and tg_op = 'UPDATE' then
    new.coa_level := old.coa_level;
    return new;
  end if;
  new.coa_level := case
    when new.status = 'minted' then 3
    when new.status in ('metadata_pinned', 'minting') then 2
    when new.status in ('issued', 'revoked', 'failed') then 1
    else 0
  end;
  return new;
end;
$$;

drop trigger if exists coa_certificates_sync_level_trg on coa_certificates;
create trigger coa_certificates_sync_level_trg
  before insert or update of status on coa_certificates
  for each row execute function coa_certificates_sync_level();

-- Re-run the backfill now that the trigger exists, for any row that drifted
-- between 0046 and this migration.
update coa_certificates set status = status;

-- ── artist_verification_status (on "user") ──────────────────────────────────

alter table "user" add column if not exists artist_verification_status text
  not null default 'unverified';

alter table "user" drop constraint if exists user_artist_verification_status_check;
alter table "user" add constraint user_artist_verification_status_check
  check (artist_verification_status in ('unverified', 'pending', 'approved', 'rejected'));

-- Backfill from existing real state: identity_verified = true means an
-- approval already happened (even if this column didn't exist yet to record
-- it); otherwise take the most recent pw_identity_verifications row's status,
-- if any; otherwise 'unverified' (the column default already covers that).
update "user" u set artist_verification_status = 'approved'
where u.identity_verified = true and u.artist_verification_status = 'unverified';

update "user" u set artist_verification_status = latest.status
from (
  select distinct on (user_id) user_id, status
  from pw_identity_verifications
  order by user_id, created_at desc
) latest
where u.id = latest.user_id
  and u.identity_verified = false
  and u.artist_verification_status = 'unverified';

-- ── binding_level (on art_tags) — generated, same-row inputs only ──────────

alter table art_tags add column if not exists binding_level integer
  generated always as (
    case
      when binding_status = 'bound' and key_reference is not null and sun_counter_last_seen is not null then 3
      when binding_status = 'bound' and key_reference is not null then 2
      when binding_status = 'bound' then 1
      else 0
    end
  ) stored;

alter table art_tags drop constraint if exists art_tags_binding_level_check;
alter table art_tags add constraint art_tags_binding_level_check
  check (binding_level >= 0 and binding_level <= 3);

-- ── provenance_level (P0-P4) — view, cross-table ────────────────────────────
-- P0 none, P1 COA issued off-chain, P2 mint commitment opened (pending),
-- P3 commitment confirmed on-chain (committed), P4 minted (final).

create or replace view artwork_provenance_levels as
select
  a.id as artwork_id,
  case
    when exists (select 1 from mint_commitments m where m.artwork_id = a.id and m.status = 'minted') then 4
    when exists (select 1 from mint_commitments m where m.artwork_id = a.id and m.status = 'committed') then 3
    when exists (select 1 from mint_commitments m where m.artwork_id = a.id and m.status in ('pending', 'failed')) then 2
    when exists (select 1 from coa_certificates c where c.artwork_id = a.id and c.coa_level >= 1) then 1
    else 0
  end as provenance_level
from artworks a;

-- ── transaction_eligibility — view, literally canSecondarySell's gate ──────

create or replace view artwork_transaction_eligibility as
select
  a.id as artwork_id,
  (
    a.lifecycle_status = 'published'
    and u.identity_verified = true
    and exists (select 1 from coa_certificates c where c.artwork_id = a.id and c.coa_level >= 1)
  ) as transaction_eligible
from artworks a
join "user" u on u.id = a."userId";

commit;
