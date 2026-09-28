-- 0014: Add NFT minting fields to coa_certificates for on-chain COA flow.
-- Supports: IPFS pinning, EIP-712 voucher minting, on-chain confirmation.

ALTER TABLE coa_certificates
  ADD COLUMN IF NOT EXISTS "imageCid"         text,
  ADD COLUMN IF NOT EXISTS "metadataCid"      text,
  ADD COLUMN IF NOT EXISTS "metadataUri"      text,
  ADD COLUMN IF NOT EXISTS "metadataSha256"   text,
  ADD COLUMN IF NOT EXISTS "mintNonce"        text,
  ADD COLUMN IF NOT EXISTS "txHash"           text,
  ADD COLUMN IF NOT EXISTS "chainId"          integer,
  ADD COLUMN IF NOT EXISTS "contractAddr"     text,
  ADD COLUMN IF NOT EXISTS "tokenId"          text,
  ADD COLUMN IF NOT EXISTS "mintedAt"         timestamptz,
  ADD COLUMN IF NOT EXISTS "mintRequestedAt"  timestamptz,
  ADD COLUMN IF NOT EXISTS "mintError"        text,
  ADD COLUMN IF NOT EXISTS "creatorName"      text,
  ADD COLUMN IF NOT EXISTS "objectType"       text,
  ADD COLUMN IF NOT EXISTS "privacy"          text DEFAULT 'public';

-- Status lifecycle for the NFT flow: 'draft' -> 'metadata_pinned' -> 'minting'
-- -> 'minted' | 'failed'. The CHECK constraint from 0013 only allows
-- ('draft','issued','revoked'); 0015 widens it to include these states.
