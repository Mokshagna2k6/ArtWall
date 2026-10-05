-- 0046: coa_certificates.coa_level, a real stored 0-3 state (DB-3.02).
--
-- Today coa_level is implicit in coa_certificates.status text (draft/issued/
-- revoked/metadata_pinned/minting/minted/failed) — there is no int column, so
-- "level 0" cannot be distinguished from "no certificate row at all" (NULL)
-- without parsing status text everywhere. DB-3.01's trust-dimension mapping
-- (docs/policy-engine.md) already treats status as the source of truth for
-- coaIssued; this adds the literal 0-3 column DB-3.02 asks for, backfilled
-- from existing status, without changing status itself or any caller of it.
--
-- Level mapping (0-3, per F62 / Bible section 3-11's coa_level dimension):
--   0 = draft (no certificate issued yet — the real default)
--   1 = issued (off-chain COA issued)
--   2 = metadata_pinned | minting (on-chain mint in flight)
--   3 = minted (on-chain, final)
--   revoked / failed keep whatever level they were at when revoked/failed —
--   revocation is a separate fact (revoked_at), not a level regression, so a
--   revoked certificate's level says what it reached, and revoked_at says it
--   no longer counts.

begin;

alter table coa_certificates add column if not exists coa_level integer not null default 0;

alter table coa_certificates drop constraint if exists coa_certificates_coa_level_check;
alter table coa_certificates add constraint coa_certificates_coa_level_check
  check (coa_level >= 0 and coa_level <= 3);

-- FE-3.xx verification (frontend-phase3-ui branch) found this UPDATE cannot
-- actually reach a revoked row: 0029's coa_certificates_guard trigger raises
-- "a revoked certificate cannot be changed" on ANY update once status =
-- 'revoked', unconditionally — there is no backfill exception in that guard.
-- This migration's own header comment says a revoked row should "keep
-- whatever level they were at when revoked" rather than regress, but by the
-- time this backfill runs that is structurally unreachable: the trigger
-- forbids writing coa_level on a revoked row at all, so it is excluded here
-- rather than crashing every migrate run on a database with a real revoked
-- certificate (confirmed against 7 such rows on a live Neon branch).
-- Consequence: a revoked certificate's coa_level stays at the column default
-- (0) forever, even if it reached level 2 or 3 before revocation — a real,
-- narrower gap than this file originally intended, left for whoever owns
-- DB-3.02 to close (e.g. teaching the guard to allow coa_level specifically,
-- or reading it through a case expression at query time instead of storing
-- it). Flagging here rather than silently narrowing scope.
update coa_certificates set coa_level = case
  when status in ('minted') then 3
  when status in ('metadata_pinned', 'minting') then 2
  when status in ('issued', 'failed') then 1
  else 0
end
where coa_level = 0 and status <> 'revoked'; -- only backfill rows still at the column default

commit;
