import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db, pool } from "@/lib/db/index";
import { artTags, artworks, coaCertificates, curatorPicks, mintCommitments, user } from "@/lib/db/schema";
import type { TrustDimensions } from "@/features/policy/engine";
import { computeBindingLevel, computeProvenanceLevel } from "@/features/policy/levels";

// "failed" is a real, retryable state (a chain tx failed; mint-voucher's own
// comment: "failed -> retry with a fresh voucher") — the certificate itself
// stays issued, only the on-chain attempt failed, so it counts the same as
// "issued" here. Confirmed against 0052's coa_level trigger, which
// deliberately carries the level forward into "revoked"/"failed" rather than
// resetting it (docs/policy-engine.md's "coa_level drift fix").
const COA_ISSUED_STATUSES = ["issued", "metadata_pinned", "minting", "minted", "failed"] as const;

/**
 * DB-3.01: the canonical loader for {@link TrustDimensions}.
 *
 * The five trust dimensions are not new columns — each one already has a
 * single, unambiguous source of truth in an existing Phase 1/2 table (see
 * docs/policy-engine.md's mapping table, which this function turns into
 * actual code). Storing a sixth, mirrored copy on `artworks` would need to be
 * kept in sync with `art_tags`, `coa_certificates`, `mint_commitments` and
 * `curator_picks` by hand on every write path that touches any of them — a
 * drift bug waiting to happen, not a feature. This loader reads the real rows
 * live instead, one query per dimension, all in parallel.
 *
 * - identityVerified        -> user.identity_verified
 * - physicalBindingVerified -> exists an art_tags row for this artwork with
 *                               bound_at not null (NFC/QR tag bound, B-level)
 * - blockchainAnchored      -> exists a mint_commitments row for this artwork
 *                               with status = 'minted' (on-chain, not pending)
 * - coaIssued               -> coa_certificates.status is 'issued' or further
 *                               along the on-chain flow ('metadata_pinned',
 *                               'minting', 'minted'); 'draft'/'revoked' do not
 *                               count
 * - curationApproved        -> exists a curator_picks row for this artwork
 *                               (no separate approval workflow exists yet —
 *                               a pick IS the approval; see docs/policy-engine.md)
 */
export async function loadTrustDimensions(artworkId: string): Promise<TrustDimensions> {
  const [artwork] = await db
    .select({ userId: artworks.userId })
    .from(artworks)
    .where(eq(artworks.id, artworkId))
    .limit(1);
  if (!artwork) {
    return {
      identityVerified: false,
      physicalBindingVerified: false,
      blockchainAnchored: false,
      coaIssued: false,
      curationApproved: false,
      provenanceLevel: "P0",
      bindingLevel: "B0",
    };
  }

  const [ownerRows, boundTagRows, mintedRows, coaRows, pickRows, provenanceLevel, bindingLevel] = await Promise.all([
    db.select({ identityVerified: user.identityVerified }).from(user).where(eq(user.id, artwork.userId)).limit(1),
    db
      .select({ id: artTags.id })
      .from(artTags)
      .where(and(eq(artTags.artworkId, artworkId), isNotNull(artTags.boundAt)))
      .limit(1),
    db
      .select({ id: mintCommitments.id })
      .from(mintCommitments)
      .where(and(eq(mintCommitments.artworkId, artworkId), eq(mintCommitments.status, "minted")))
      .limit(1),
    db.select({ status: coaCertificates.status }).from(coaCertificates).where(eq(coaCertificates.artworkId, artworkId)),
    db.select({ id: curatorPicks.id }).from(curatorPicks).where(eq(curatorPicks.artworkId, artworkId)).limit(1),
    // BC-3.08/3.12: the granular on-chain provenance level and physical
    // binding level, computed from the same tables above plus
    // art_tag_scans — see levels.ts. Populating these alongside the plain
    // booleans is what lets canExhibit (BC-3.15) enforce the stricter
    // "anchored, not just a pending commitment" / "crypto-verified, not
    // just installed" bar instead of a mere existence check.
    computeProvenanceLevel(artworkId),
    computeBindingLevel(artworkId),
  ]);

  return {
    identityVerified: ownerRows[0]?.identityVerified ?? false,
    physicalBindingVerified: boundTagRows.length > 0,
    blockchainAnchored: mintedRows.length > 0,
    coaIssued: coaRows.some((r) => (COA_ISSUED_STATUSES as readonly string[]).includes(r.status)),
    curationApproved: pickRows.length > 0,
    provenanceLevel,
    bindingLevel,
  };
}

/**
 * DB-3.01: the real GRADED trust-dimension levels, for the trust-panel UI
 * (FE-3.01-3.04, not yet built) that needs "COA level 2 of 3", not just a
 * checkmark. This is a separate, narrower concern from
 * {@link loadTrustDimensions} above: that loader feeds the PolicyEngine's
 * yes/no gates; this one surfaces the graded state those yes/no facts are
 * collapsed from. See migration 0052 for exactly how each level is derived
 * and why (generated column vs view, per dimension).
 */
export interface TrustDimensionLevels {
  /** unverified | pending | approved | rejected. Stored on "user" (0052). */
  artistVerificationStatus: string;
  /** 0-3. Stored on coa_certificates, backfilled from status (0046, DB-3.02). */
  coaLevel: number;
  /** 0-4 (P0-P4). Read from the artwork_provenance_levels view (0052). */
  provenanceLevel: number;
  /** 0-3 (B0-B3). Generated column on the artwork's bound art_tags row, 0 if
   *  unbound or no tag exists (0052). */
  bindingLevel: number;
  /** Literally canSecondarySell's three preconditions, read live (0052). */
  transactionEligible: boolean;
}

export async function loadTrustDimensionLevels(artworkId: string): Promise<TrustDimensionLevels> {
  const { rows } = await pool.query<{
    artist_verification_status: string | null;
    coa_level: number | null;
    provenance_level: number;
    binding_level: number | null;
    transaction_eligible: boolean | null;
  }>(
    `select
       u.artist_verification_status,
       (select max(c.coa_level) from coa_certificates c where c.artwork_id = a.id) as coa_level,
       coalesce(p.provenance_level, 0) as provenance_level,
       (select max(t.binding_level) from art_tags t where t.artwork_id = a.id) as binding_level,
       e.transaction_eligible
     from artworks a
     join "user" u on u.id = a."userId"
     left join artwork_provenance_levels p on p.artwork_id = a.id
     left join artwork_transaction_eligibility e on e.artwork_id = a.id
     where a.id = $1
     limit 1`,
    [artworkId]
  );

  const row = rows[0];
  return {
    artistVerificationStatus: row?.artist_verification_status ?? "unverified",
    coaLevel: row?.coa_level ?? 0,
    provenanceLevel: row?.provenance_level ?? 0,
    bindingLevel: row?.binding_level ?? 0,
    transactionEligible: row?.transaction_eligible ?? false,
  };
}
