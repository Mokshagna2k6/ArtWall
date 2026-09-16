import "server-only";

import { createHash } from "node:crypto";

/**
 * Deterministic metadata hash for COA.
 * Canonical: sort keys, stringify, SHA-256.
 */
export function computeMetadataHash(fields: {
  title: string;
  artist: string;
  medium?: string | null;
  dimensions?: string | null;
  year?: number | null;
  imagePublicId?: string | null;
}): string {
  const canonical = JSON.stringify(fields, Object.keys(fields).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

/** Leaf hash for Merkle tree: SHA-256(artworkId + metadataHash + walletAddress + royaltyBps) */
export function computeLeafHash(fields: {
  artworkId: string;
  metadataHash: string;
  walletAddress: string;
  royaltyBps: number;
}): string {
  const data = `${fields.artworkId}:${fields.metadataHash}:${fields.walletAddress}:${fields.royaltyBps}`;
  return createHash("sha256").update(data).digest("hex");
}
