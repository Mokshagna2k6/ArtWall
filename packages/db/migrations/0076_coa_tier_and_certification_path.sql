-- 0076: the Bible's COA tier (COA-0..COA-3) and the three minting paths, as data.
--
-- Purely additive: two new columns, nothing dropped, nothing retyped, no
-- existing trigger or constraint touched.
--
-- ---------------------------------------------------------------------------
-- Why coa_tier exists when coa_certificates.coa_level already does
-- ---------------------------------------------------------------------------
-- coa_level (0046) looks like the Bible's COA tier but is not. 0052 attached
-- the trigger coa_certificates_sync_level_trg, which *derives* coa_level from
-- the mint status on every write:
--
--   minted                      -> 3
--   metadata_pinned | minting   -> 2
--   issued | revoked | failed   -> 1
--   else                        -> 0
--
-- So coa_level answers "how far along the blockchain mint flow is this
-- certificate", and it cannot answer anything else — the trigger overwrites
-- any value the app tries to store. That is a *provenance* reading wearing a
-- COA label, which is exactly what Bible section 7 rule 7 forbids:
--
--   "HOLOGRAPHIC COA != BLOCKCHAIN PROVENANCE"
--
-- COA tier and blockchain provenance are SEPARATE trust dimensions (Bible
-- section 3: five dimensions, never collapsed into one "verified"). A COA-3
-- institutional certificate on a work that was never minted is a valid,
-- expected state; so is a minted work holding no holographic COA at all.
-- Deriving one from the other in either direction is the bug.
--
-- coa_tier is therefore a new, independently-set column. It is never computed
-- from status, has no trigger, and nothing in this migration couples it to
-- coa_level. coa_level is left exactly as it is: the policy engine, the
-- provenance view and docs/architecture/policy-engine.md all read it as the
-- mint-progress number it actually is, and retyping or repurposing it would
-- silently change those meanings.
--
-- Tiers (Bible sections 6-9):
--   0 = NO COA. A *state*, not a tier — a valid, listable condition, not a
--       failure. Primary listing is allowed at COA-0; only secondary sale and
--       royalty eligibility wait on provenance. It is the default precisely
--       because most certificates carry no holographic document.
--   1 = COA-1 Standard holographic   (physical document only)
--   2 = COA-2 Premium holographic    (no automatic blockchain)
--   3 = COA-3 Institutional          (still no automatic blockchain)
--
-- Existing rows: every certificate gets tier 0, which is the honest answer.
-- No holographic COA was ever issued by this platform (coa_certificates.pdf_url
-- has never been written to — see HANDOFF.md), so there is no tier to recover,
-- and backfilling a tier from coa_level would re-commit the very conflation
-- this column exists to separate.
--
-- ---------------------------------------------------------------------------
-- Why certification_path lives on artworks
-- ---------------------------------------------------------------------------
-- Bible section 10 Part 1 / section 14: an artwork takes exactly one of three
-- minting paths, and the choice is a property of the *work*, not of a given
-- certificate row (a work can accumulate several certificate versions along
-- one path). Today nothing records which path a work took.
--
--   lazy     Free, the default. No immediate on-chain write; a commitment is
--            anchored in the daily Merkle root and only materialises on a
--            trigger (first sale, NFC binding, exhibition placement, artist
--            request, secondary listing).
--   polygon  Rs.499 Polygon zkEVM certificate. Immediate on-chain, not a
--            tradeable NFT.
--   base_nft Rs.299 Base L2 ERC-721. Immediate on-chain and tradeable.
--
-- Default 'lazy' matches the Bible's stated default and is correct for every
-- existing row: no artwork has ever been offered a paid path.

begin;

-- ── coa_certificates.coa_tier ────────────────────────────────────────────────

alter table coa_certificates
  add column if not exists coa_tier integer not null default 0;

alter table coa_certificates
  drop constraint if exists coa_certificates_coa_tier_check;
alter table coa_certificates
  add constraint coa_certificates_coa_tier_check
  check (coa_tier >= 0 and coa_tier <= 3);

comment on column coa_certificates.coa_tier is
  'Bible 6-9 COA tier: 0 = NO COA (a valid state, not a tier), 1 = standard '
  'holographic, 2 = premium holographic, 3 = institutional. Set explicitly, '
  'never derived. Bible 7 rule 7: a holographic COA does NOT imply blockchain '
  'provenance — this is NOT coa_level, which tracks mint progress (0046/0052).';

-- ── artworks.certification_path ──────────────────────────────────────────────

alter table artworks
  add column if not exists certification_path text not null default 'lazy';

alter table artworks
  drop constraint if exists artworks_certification_path_check;
alter table artworks
  add constraint artworks_certification_path_check
  check (certification_path in ('lazy', 'polygon', 'base_nft'));

comment on column artworks.certification_path is
  'Bible 10 Part 1 / 14 minting path: lazy (free, default) | polygon (Rs.499 '
  'immediate cert) | base_nft (Rs.299 tradeable ERC-721).';

commit;
