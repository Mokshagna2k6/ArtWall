import { describe, it, expect } from "vitest";

// The shipped modules — not copies.
import {
  buildMerkleTree,
  hashPair,
  keccak256,
  verifyMerkleProof,
  type Hex,
} from "@/features/coa/merkle";
import { computeLeafHash } from "@/features/coa/hash";

/* ── Independent reference keccak256 (BigInt keccak-f[1600]) ─────────────── */
// Written from the Keccak spec, sharing no code with @noble/hashes, so a bug in
// either the library wiring or the pair ordering shows up as a mismatch.

const MASK = (1n << 64n) - 1n;
const RC = [
  0x1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x8an, 0x88n, 0x80008009n, 0x8000000an,
  0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n,
];
const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
]; // ROT[x][y]

const rotl = (v: bigint, n: number) =>
  n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK;

function keccakF(s: bigint[]) {
  for (let round = 0; round < 24; round++) {
    const c = [0, 1, 2, 3, 4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let i = 0; i < 25; i++) s[i] ^= c[(i + 4) % 5] ^ rotl(c[(i + 1) % 5], 1);
    const b = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x][y]);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        s[x + 5 * y] = b[x + 5 * y] ^ (~b[((x + 1) % 5) + 5 * y] & MASK & b[((x + 2) % 5) + 5 * y]);
    s[0] ^= RC[round];
  }
}

function refKeccak(msg: Uint8Array): Hex {
  const rate = 136;
  const padded = new Uint8Array(Math.floor(msg.length / rate + 1) * rate);
  padded.set(msg);
  padded[msg.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const s = new Array<bigint>(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let k = 7; k >= 0; k--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + k]);
      s[i] ^= lane;
    }
    keccakF(s);
  }
  let out = "";
  for (let i = 0; i < 4; i++)
    for (let k = 0; k < 8; k++) out += Number((s[i] >> BigInt(8 * k)) & 0xffn).toString(16).padStart(2, "0");
  return `0x${out}`;
}

const hex = (h: string) => Buffer.from(h.replace(/^0x/, ""), "hex");
const utf8 = (t: string) => new TextEncoder().encode(t);
const refPair = (a: Hex, b: Hex) => refKeccak(Buffer.concat(a < b ? [hex(a), hex(b)] : [hex(b), hex(a)]));

/** What ArtworkRegistry._verify / OZ MerkleProof.processProof do. */
function refVerify(leaf: Hex, proof: Hex[], root: Hex) {
  return proof.reduce(refPair, leaf) === root;
}

/** Reference root: sorted leaves, sorted pairs, odd node promoted. */
function refRoot(leaves: Hex[]): Hex {
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2)
      next.push(i + 1 < level.length ? refPair(level[i], level[i + 1]) : level[i]);
    level = next;
  }
  return level[0];
}

const leavesOf = (n: number) => Array.from({ length: n }, (_, i) => refKeccak(utf8(`artwork-${i}`)));

describe("keccak256", () => {
  it("matches the published Keccak-256 test vectors (not SHA3-256)", () => {
    const empty = "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
    const abc = "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45";
    expect(keccak256(new Uint8Array())).toBe(empty);
    expect(refKeccak(new Uint8Array())).toBe(empty);
    expect(keccak256(utf8("abc"))).toBe(abc);
    expect(refKeccak(utf8("abc"))).toBe(abc);
  });

  it("agrees with the reference across the 136-byte block boundary", () => {
    for (const len of [0, 1, 64, 135, 136, 137, 300]) {
      const data = Uint8Array.from({ length: len }, (_, i) => (i * 31 + 7) & 0xff);
      expect(keccak256(data)).toBe(refKeccak(data));
    }
  });

  it("hashPair is order-independent keccak(min ‖ max)", () => {
    const [a, b] = leavesOf(2);
    expect(hashPair(a, b)).toBe(hashPair(b, a));
    expect(hashPair(a, b)).toBe(refPair(a, b));
  });
});

describe("buildMerkleTree", () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17]) {
    it(`${n} leaves: every proof verifies, via ours and the reference`, () => {
      const leaves = leavesOf(n);
      const { root, proofs } = buildMerkleTree(leaves);

      expect(root).toBe(refRoot(leaves));
      expect(proofs.size).toBe(n);
      for (const leaf of leaves) {
        const proof = proofs.get(leaf)!;
        expect(proof.length).toBeLessThanOrEqual(Math.ceil(Math.log2(n)));
        expect(verifyMerkleProof(leaf, proof, root)).toBe(true);
        expect(refVerify(leaf, proof, root)).toBe(true);
      }
    });
  }

  it("single leaf: root is the leaf, empty proof", () => {
    const [leaf] = leavesOf(1);
    const { root, proofs } = buildMerkleTree([leaf]);
    expect(root).toBe(leaf);
    expect(proofs.get(leaf)).toEqual([]);
  });

  it("root does not depend on input order", () => {
    const leaves = leavesOf(7);
    expect(buildMerkleTree(leaves).root).toBe(buildMerkleTree([...leaves].reverse()).root);
  });

  it("accepts un-prefixed / upper-case hex and normalises it", () => {
    const leaves = leavesOf(3);
    const { root } = buildMerkleTree(leaves.map((l) => l.slice(2).toUpperCase()));
    expect(root).toBe(buildMerkleTree(leaves).root);
  });

  it("rejects empty input, duplicates and non-bytes32 leaves", () => {
    const [a] = leavesOf(1);
    expect(() => buildMerkleTree([])).toThrow();
    expect(() => buildMerkleTree([a, a])).toThrow(/Duplicate/);
    expect(() => buildMerkleTree(["abc"])).toThrow(/bytes32/);
  });
});

describe("verifyMerkleProof", () => {
  const leaves = leavesOf(9);
  const { root, proofs } = buildMerkleTree(leaves);

  it("rejects a leaf that is not in the tree", () => {
    expect(verifyMerkleProof(refKeccak(utf8("intruder")), proofs.get(leaves[0])!, root)).toBe(false);
  });

  it("rejects a proof with a tampered sibling", () => {
    const proof = [...proofs.get(leaves[3])!];
    proof[1] = refKeccak(utf8("tampered"));
    expect(verifyMerkleProof(leaves[3], proof, root)).toBe(false);
  });

  it("rejects another leaf's proof and the wrong root", () => {
    expect(verifyMerkleProof(leaves[0], proofs.get(leaves[5])!, root)).toBe(false);
    expect(verifyMerkleProof(leaves[0], proofs.get(leaves[0])!, leaves[1])).toBe(false);
  });

  it("returns false (not throw) on malformed input", () => {
    expect(verifyMerkleProof("nope", [], root)).toBe(false);
  });
});

describe("computeLeafHash (OZ StandardMerkleTree leaf)", () => {
  const fields = {
    artworkId: "art_1",
    metadataHash: "ab".repeat(32),
    walletAddress: "0x00000000000000000000000000000000000000Aa",
    royaltyBps: 500,
  };

  it("equals keccak256(keccak256(abi.encode(bytes32,bytes32,address,uint256)))", () => {
    const encoded = Buffer.concat([
      hex(refKeccak(utf8("art_1"))),
      hex("ab".repeat(32)),
      hex("aa".padStart(64, "0")),
      hex((500).toString(16).padStart(64, "0")),
    ]);
    const expected = refKeccak(hex(refKeccak(encoded)));
    expect(computeLeafHash(fields)).toBe(expected);
  });

  it("changes with every committed field", () => {
    const base = computeLeafHash(fields);
    expect(computeLeafHash({ ...fields, artworkId: "art_2" })).not.toBe(base);
    expect(computeLeafHash({ ...fields, royaltyBps: 501 })).not.toBe(base);
    expect(computeLeafHash({ ...fields, metadataHash: "cd".repeat(32) })).not.toBe(base);
  });

  it("rejects a malformed wallet or royalty", () => {
    expect(() => computeLeafHash({ ...fields, walletAddress: "0x1234" })).toThrow();
    expect(() => computeLeafHash({ ...fields, royaltyBps: 10_001 })).toThrow();
  });
});
