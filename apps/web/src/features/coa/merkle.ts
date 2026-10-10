import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

/**
 * Merkle tree for mint commitments.
 *
 * Scheme (OpenZeppelin `MerkleProof.verify` compatible, and identical to
 * `ArtworkRegistry._verify` in contracts/src):
 *
 *  - leaves and nodes are bytes32, written here as lowercase `0x` + 64 hex;
 *  - parent = keccak256(abi.encodePacked(min(a, b), max(a, b))) — sorted pairs,
 *    so a proof is just a list of siblings with no left/right flags;
 *  - an unpaired node at the end of a level is promoted unchanged to the next
 *    level (not hashed with itself), so its proof simply has no entry there.
 *
 * Pure module (no `server-only`): the test suite imports it directly.
 */

export type Hex = `0x${string}`;

const BYTES32 = /^0x[0-9a-f]{64}$/;

/** Normalise and validate a bytes32 hex string. */
export function toBytes32(value: string): Hex {
  const hex = (value.startsWith("0x") ? value : `0x${value}`).toLowerCase();
  if (!BYTES32.test(hex)) throw new Error(`Not a bytes32 hex value: ${value}`);
  return hex as Hex;
}

export function keccak256(data: Uint8Array): Hex {
  return `0x${bytesToHex(keccak_256(data))}`;
}

/** keccak256 of the two nodes, smaller first. Equal-length lowercase hex compares like uint256. */
export function hashPair(a: Hex, b: Hex): Hex {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const buf = new Uint8Array(64);
  buf.set(hexToBytes(lo.slice(2)), 0);
  buf.set(hexToBytes(hi.slice(2)), 32);
  return keccak256(buf);
}

/**
 * Build the tree. Leaves are sorted first so the root does not depend on the
 * order commitments were read in. Duplicate leaves are rejected: they would
 * share one proof entry and signal a double commitment upstream.
 */
export function buildMerkleTree(input: string[]): {
  root: Hex;
  proofs: Map<Hex, Hex[]>;
} {
  if (input.length === 0) throw new Error("Cannot build a Merkle tree with no leaves");

  const leaves = input.map(toBytes32).sort();
  for (let i = 1; i < leaves.length; i++) {
    if (leaves[i] === leaves[i - 1]) throw new Error(`Duplicate Merkle leaf ${leaves[i]}`);
  }

  const levels: Hex[][] = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const level = levels[levels.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i]);
    }
    levels.push(next);
  }

  const proofs = new Map<Hex, Hex[]>();
  leaves.forEach((leaf, leafIndex) => {
    const proof: Hex[] = [];
    let index = leafIndex;
    for (const level of levels.slice(0, -1)) {
      const sibling = index ^ 1;
      if (sibling < level.length) proof.push(level[sibling]);
      index >>= 1;
    }
    proofs.set(leaf, proof);
  });

  return { root: levels[levels.length - 1][0], proofs };
}

/** Verify a proof exactly as the contract does. */
export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  try {
    let hash = toBytes32(leaf);
    for (const sibling of proof) hash = hashPair(hash, toBytes32(sibling));
    return hash === toBytes32(root);
  } catch {
    return false;
  }
}
