-- 0029: certificate immutability and mint state guards (DB-2.06, DB-2.14, DB-2.15).
--
-- Status machine, as the app drives it (src/features/coa/actions.ts,
-- src/app/api/blockchain/**):
--
--   draft           -> issued | metadata_pinned | revoked
--   issued          -> revoked
--   metadata_pinned -> minting | revoked
--   minting         -> minted | failed | metadata_pinned (fresh voucher after a dropped tx) | revoked
--   failed          -> metadata_pinned | revoked
--   minted          -> revoked
--   revoked         -> (terminal; the row is frozen)
--
-- Once a certificate leaves 'draft' its content is fixed: artwork, edition,
-- metadata hash, pinned metadata, version. issued_at is fixed once set. Once
-- minted, the on-chain facts (tx, token, chain, contract, mint time, nonce) are
-- fixed too, including after a revoke: the token still exists.
--
-- DELETE: drafts only, except during DPDP erasure of the owner.

create or replace function coa_certificates_guard() returns trigger
language plpgsql as $$
declare
  erasing text;
  k text;
  frozen text[] := '{}';
begin
  if tg_op = 'DELETE' then
    erasing := artwall_erasing_user();
    if old.status = 'draft'
       or (erasing is not null and (
             old.user_id = erasing
             or exists (select 1 from artworks a where a.id = old.artwork_id and a."userId" = erasing))) then
      return old;
    end if;
    raise exception 'coa_certificates %: a % certificate cannot be deleted', old.id, old.status
      using errcode = 'restrict_violation';
  end if;

  if old.status = 'revoked' then
    raise exception 'coa_certificates %: a revoked certificate cannot be changed', old.id
      using errcode = 'restrict_violation';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'draft'           and new.status in ('issued', 'metadata_pinned', 'revoked'))
    or (old.status = 'issued'          and new.status = 'revoked')
    or (old.status = 'metadata_pinned' and new.status in ('minting', 'revoked'))
    or (old.status = 'minting'         and new.status in ('minted', 'failed', 'metadata_pinned', 'revoked'))
    or (old.status = 'failed'          and new.status in ('metadata_pinned', 'revoked'))
    or (old.status = 'minted'          and new.status = 'revoked')
  ) then
    raise exception 'coa_certificates %: status % -> % is not allowed', old.id, old.status, new.status
      using errcode = 'check_violation';
  end if;

  if old.status <> 'draft' then
    frozen := frozen || array['artwork_id', 'edition_id', 'metadata_hash', 'version',
                              'metadataSha256', 'metadataUri', 'metadataCid', 'imageCid'];
  end if;
  if old.issued_at is not null then
    frozen := frozen || array['issued_at'];
  end if;
  if old.status = 'minted' then
    frozen := frozen || array['txHash', 'tokenId', 'chainId', 'contractAddr', 'mintedAt', 'mintNonce'];
  end if;

  foreach k in array frozen loop
    if to_jsonb(new) -> k is distinct from to_jsonb(old) -> k then
      raise exception 'coa_certificates %: "%" cannot change once the certificate is %', old.id, k, old.status
        using errcode = 'restrict_violation';
    end if;
  end loop;

  return new;
end $$;

create or replace trigger coa_certificates_guard
  before update or delete on coa_certificates
  for each row execute function coa_certificates_guard();
create or replace trigger coa_certificates_no_truncate
  before truncate on coa_certificates
  for each statement execute function artwall_append_only();
revoke truncate on coa_certificates from public, current_user;

-- Each status carries the facts that make it true (DB-2.14).
alter table coa_certificates drop constraint if exists coa_certificates_issued_check;
alter table coa_certificates add constraint coa_certificates_issued_check
  check (status <> 'issued' or issued_at is not null);

alter table coa_certificates drop constraint if exists coa_certificates_revoked_check;
alter table coa_certificates add constraint coa_certificates_revoked_check
  check (status <> 'revoked' or revoked_at is not null);

alter table coa_certificates drop constraint if exists coa_certificates_minting_check;
alter table coa_certificates add constraint coa_certificates_minting_check
  check (status <> 'minting' or "txHash" is not null);

alter table coa_certificates drop constraint if exists coa_certificates_minted_check;
alter table coa_certificates add constraint coa_certificates_minted_check
  check (status <> 'minted' or ("txHash" is not null and "tokenId" is not null
                                and "chainId" is not null and "contractAddr" is not null
                                and "mintedAt" is not null));

alter table mint_commitments drop constraint if exists mint_commitments_minted_check;
alter table mint_commitments add constraint mint_commitments_minted_check
  check (status <> 'minted' or (token_id is not null and mint_tx_hash is not null));

-- A voucher nonce is issued once, ever (DB-2.15). The contract rejects a
-- replayed nonce; this stops two certificates ever holding the same one.
create unique index if not exists coa_certificates_mint_nonce_uidx
  on coa_certificates ("mintNonce") where "mintNonce" is not null;

-- One token id per contract per chain: two certificates cannot claim the same NFT.
create unique index if not exists coa_certificates_token_uidx
  on coa_certificates ("chainId", lower("contractAddr"), "tokenId") where "tokenId" is not null;
