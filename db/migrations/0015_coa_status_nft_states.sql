-- 0015: Widen coa_certificates.status for the on-chain mint flow (0014).
--
-- 0013 limited status to ('draft','issued','revoked'), so every write of
-- 'metadata_pinned' / 'minting' / 'minted' / 'failed' from
-- src/app/api/blockchain/** failed at runtime with a CHECK violation.
--
--   off-chain:  draft -> issued -> revoked            (src/features/coa/actions.ts)
--   on-chain:   draft -> metadata_pinned -> minting -> minted | failed
--               (src/app/api/blockchain/certificates/**, cron/reconcile-mints)

alter table coa_certificates drop constraint if exists coa_certificates_status_check;

alter table coa_certificates add constraint coa_certificates_status_check
  check (status in ('draft', 'issued', 'revoked',
                    'metadata_pinned', 'minting', 'minted', 'failed'));
