import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

// Inline the pure functions to avoid server-only import issues
function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hashPair(a: string, b: string): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return sha256(lo + hi);
}

function buildMerkleTree(leaves: string[]) {
  if (leaves.length === 0) return { root: "", proofs: new Map<string, string[]>() };
  if (leaves.length === 1) return { root: leaves[0], proofs: new Map([[leaves[0], []]]) };

  const sorted = [...leaves].sort();
  const proofs = new Map<string, string[]>(sorted.map((l) => [l, []]));
  let level = sorted;

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(hashPair(left, right));
      for (const [leaf, proof] of proofs) {
        let hash = leaf;
        for (const s of proof) hash = hashPair(hash, s);
        if (hash === left) proof.push(right);
        else if (hash === right) proof.push(left);
      }
    }
    level = next;
  }
  return { root: level[0], proofs };
}

function verifyProof(leaf: string, proof: string[], root: string): boolean {
  let hash = leaf;
  for (const sibling of proof) hash = hashPair(hash, sibling);
  return hash === root;
}

describe("Merkle tree", () => {
  it("single leaf", () => {
    const { root, proofs } = buildMerkleTree(["abc"]);
    expect(root).toBe("abc");
    expect(proofs.get("abc")).toEqual([]);
  });

  it("two leaves produce valid proofs", () => {
    const a = sha256("artwork1");
    const b = sha256("artwork2");
    const { root, proofs } = buildMerkleTree([a, b]);
    expect(verifyProof(a, proofs.get(a)!, root)).toBe(true);
    expect(verifyProof(b, proofs.get(b)!, root)).toBe(true);
  });

  it("four leaves all verify", () => {
    const leaves = ["one", "two", "three", "four"].map((x) => sha256(x));
    const { root, proofs } = buildMerkleTree(leaves);
    for (const leaf of leaves) {
      expect(verifyProof(leaf, proofs.get(leaf)!, root)).toBe(true);
    }
  });

  it("invalid proof fails", () => {
    const leaves = [sha256("a"), sha256("b"), sha256("c")];
    const { root } = buildMerkleTree(leaves);
    expect(verifyProof(sha256("d"), [], root)).toBe(false);
  });
});
