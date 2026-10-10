import { createHash } from "node:crypto";

import { keccak256, toBytes32, type Hex } from "@/features/coa/merkle";

/**
 * Deterministic metadata hash for COA.
 * Canonical: sort keys, stringify, SHA-256. This is the public /verify/<hash>
 * value, so it must never change for an existing certificate.
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

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** One ABI word (32 bytes) as hex without 0x. */
function word(hexNo0x: string): string {
  return hexNo0x.toLowerCase().padStart(64, "0");
}

/**
 * Merkle leaf for a mint commitment, in OpenZeppelin StandardMerkleTree form:
 *
 *   keccak256(bytes.concat(keccak256(abi.encode(
 *     bytes32 keccak256(bytes(artworkId)), bytes32 metadataHash,
 *     address walletAddress, uint256 royaltyBps))))
 *
 * All four are static ABI types, so abi.encode is four 32-byte words. The
 * double hash stops a 64-byte leaf preimage being passed off as an inner node.
 */
export function computeLeafHash(fields: {
  artworkId: string;
  metadataHash: string;
  walletAddress: string;
  royaltyBps: number;
}): Hex {
  if (!ADDRESS.test(fields.walletAddress)) {
    throw new Error(`Invalid wallet address: ${fields.walletAddress}`);
  }
  if (!Number.isInteger(fields.royaltyBps) || fields.royaltyBps < 0 || fields.royaltyBps > 10_000) {
    throw new Error(`Invalid royalty bps: ${fields.royaltyBps}`);
  }

  const artworkIdHash = keccak256(new TextEncoder().encode(fields.artworkId));
  const encoded =
    word(artworkIdHash.slice(2)) +
    word(toBytes32(fields.metadataHash).slice(2)) +
    word(fields.walletAddress.slice(2)) +
    word(fields.royaltyBps.toString(16));

  const inner = keccak256(Buffer.from(encoded, "hex"));
  return keccak256(Buffer.from(inner.slice(2), "hex"));
}
