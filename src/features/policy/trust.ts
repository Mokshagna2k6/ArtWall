import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { artTags, artworks, coaCertificates, curatorPicks, mintCommitments, user } from "@/lib/db/schema";
import type { TrustDimensions } from "@/features/policy/engine";

const COA_ISSUED_STATUSES = ["issued", "metadata_pinned", "minting", "minted"] as const;

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
    };
  }

  const [ownerRows, boundTagRows, mintedRows, coaRows, pickRows] = await Promise.all([
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
  ]);

  return {
    identityVerified: ownerRows[0]?.identityVerified ?? false,
    physicalBindingVerified: boundTagRows.length > 0,
    blockchainAnchored: mintedRows.length > 0,
    coaIssued: coaRows.some((r) => (COA_ISSUED_STATUSES as readonly string[]).includes(r.status)),
    curationApproved: pickRows.length > 0,
  };
}
