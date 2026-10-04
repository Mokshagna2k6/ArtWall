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

update coa_certificates set coa_level = case
  when status in ('minted') then 3
  when status in ('metadata_pinned', 'minting') then 2
  when status in ('issued', 'revoked', 'failed') then 1
  else 0
end
where coa_level = 0; -- only backfill rows still at the column default

commit;
