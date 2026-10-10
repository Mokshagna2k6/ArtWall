import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { artTags, coaCertificates, mintCommitments, artTagScans } from "@/lib/db/schema";
import type { ProvenanceLevel, BindingLevel } from "@/features/policy/engine";

/**
 * BC-3.08: compute the real blockchain provenance level (P0-P4) for one
 * artwork from actual on-chain/off-chain state, read live (same
 * never-mirror-a-column reasoning as trust.ts's loadTrustDimensions):
 *
 *   P4 minted              coa_certificates.status = 'minted'
 *                          (ArtwallCOA.mintWithVoucher confirmed on-chain —
 *                          BC-1.18/1.19's verifyMintTx, chain.ts)
 *   P3 anchored            a mint_commitments row for this artwork has
 *                          status = 'minted' (its merkle root is confirmed
 *                          on-chain via ArtwallCOA.commitRoot — gateway.ts's
 *                          recordOnChainProvenance), even if no 1:1 NFT was
 *                          separately minted for it
 *   P2 commitment_pending  a mint_commitments row exists but isn't 'minted'
 *                          yet (status 'pending' or 'failed' — a commitment
 *                          was created but is not confirmed on any chain)
 *   P1 coa_issued          coa_certificates.status is 'issued' (an off-chain
 *                          certificate exists, nothing on-chain yet)
 *   P0 none                nothing above is true
 */
export async function computeProvenanceLevel(artworkId: string): Promise<ProvenanceLevel> {
  const [coaRows, commitmentRows] = await Promise.all([
    db.select({ status: coaCertificates.status }).from(coaCertificates).where(eq(coaCertificates.artworkId, artworkId)),
    db
      .select({ status: mintCommitments.status })
      .from(mintCommitments)
      .where(eq(mintCommitments.artworkId, artworkId)),
  ]);

  if (coaRows.some((r) => r.status === "minted")) return "P4";
  if (commitmentRows.some((r) => r.status === "minted")) return "P3";
  if (commitmentRows.length > 0) return "P2";
  if (coaRows.some((r) => r.status === "issued")) return "P1";
  return "P0";
}

/**
 * BC-3.12: compute the real physical binding level (B0-B3) for one artwork
 * from the cryptographic tag verification state:
 *
 *   B3 verified      a bound art_tags row has recorded at least one
 *                    art_tag_scans entry since being bound (BC-3.09/3.11's
 *                    resolveTagScan only ever inserts a scan row after the
 *                    SUN/QR signature verification succeeds — a scan row
 *                    existing IS a successful crypto verification, never a
 *                    raw unverified hit)
 *   B2 bound         a tag is bound (art_tags.boundAt is not null) but has
 *                    no recorded verified scan yet (just installed)
 *   B1 provisioned   a tag row exists for this artwork's would-be binding
 *                    with bindingStatus = 'provisioned' but boundAt is null
 *                    — N/A at the artwork level today (provisioning exists
 *                    before an artworkId is known); kept for completeness,
 *                    currently unreachable from this artwork-scoped query
 *   B0 unbound       no art_tags row bound to this artwork at all
 */
export async function computeBindingLevel(artworkId: string): Promise<BindingLevel> {
  const [boundTag] = await db
    .select({ id: artTags.id })
    .from(artTags)
    .where(and(eq(artTags.artworkId, artworkId), isNotNull(artTags.boundAt)))
    .limit(1);

  if (!boundTag) return "B0";

  const [verifiedScan] = await db
    .select({ id: artTagScans.id })
    .from(artTagScans)
    .where(eq(artTagScans.tagId, boundTag.id))
    .limit(1);

  return verifiedScan ? "B3" : "B2";
}
