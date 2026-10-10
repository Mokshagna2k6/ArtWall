-- 0020: store each mint commitment's Merkle proof next to its leaf.
--
-- The merkle-root cron used to keep only the root, so a commitment could
-- never be minted: the contract's mint() needs the sibling path, and it cannot
-- be rebuilt later without the exact leaf set of that batch. The proof is a
-- JSON array of 0x-prefixed bytes32 siblings (keccak256, sorted pairs — see
-- src/features/coa/merkle.ts); [] for a single-leaf root.

alter table mint_commitments add column if not exists merkle_proof jsonb;

alter table mint_commitments drop constraint if exists mint_commitments_proof_check;
alter table mint_commitments add constraint mint_commitments_proof_check
  check (merkle_proof is null or jsonb_typeof(merkle_proof) = 'array');

-- A leaf may appear in at most one live commitment: duplicate leaves in one
-- batch would make buildMerkleTree refuse the whole batch.
create unique index if not exists mint_commitments_leaf_uidx on mint_commitments (leaf_hash);
