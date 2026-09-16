import "server-only";

import { createHash } from "node:crypto";

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hashPair(a: string, b: string): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return sha256(lo + hi);
}

/** Build a Merkle tree from leaf hashes. Returns { root, proofs }. */
export function buildMerkleTree(leaves: string[]): {
  root: string;
  proofs: Map<string, string[]>;
} {
  if (leaves.length === 0) return { root: "", proofs: new Map() };
  if (leaves.length === 1) return { root: leaves[0], proofs: new Map([[leaves[0], []]]) };

  const sorted = [...leaves].sort();
  const proofs = new Map<string, string[]>(sorted.map((l) => [l, []]));

  let level = sorted;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      const parent = hashPair(left, right);
      next.push(parent);

      // append sibling to each leaf's proof that passes through this pair
      for (const [leaf, proof] of proofs) {
        const idx = findIndex(level, leaf, proof);
        if (idx === i) proof.push(right);
        else if (idx === i + 1) proof.push(left);
      }
    }
    level = next;
  }

  return { root: level[0], proofs };
}

function findIndex(level: string[], leaf: string, proof: string[]): number {
  // walk from leaf through proof to find which position in current level
  let hash = leaf;
  for (const sibling of proof.slice(0, -1)) {
    hash = hashPair(hash, sibling);
  }
  return level.indexOf(hash === leaf && proof.length === 0 ? leaf : hash);
}

/** Verify a Merkle proof. */
export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  let hash = leaf;
  for (const sibling of proof) {
    hash = hashPair(hash, sibling);
  }
  return hash === root;
}
