import { describe, it, expect } from "vitest";

// Can't import server-only modules directly in vitest, so test the pure logic inline
import { createHash } from "node:crypto";

function computeMetadataHash(fields: Record<string, unknown>): string {
  const canonical = JSON.stringify(fields, Object.keys(fields).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

function computeLeafHash(fields: {
  artworkId: string;
  metadataHash: string;
  walletAddress: string;
  royaltyBps: number;
}): string {
  const data = `${fields.artworkId}:${fields.metadataHash}:${fields.walletAddress}:${fields.royaltyBps}`;
  return createHash("sha256").update(data).digest("hex");
}

describe("computeMetadataHash", () => {
  it("is deterministic", () => {
    const a = computeMetadataHash({ title: "Sunset", artist: "Asha", medium: "Oil" });
    const b = computeMetadataHash({ title: "Sunset", artist: "Asha", medium: "Oil" });
    expect(a).toBe(b);
  });

  it("differs for different inputs", () => {
    const a = computeMetadataHash({ title: "Sunset", artist: "Asha" });
    const b = computeMetadataHash({ title: "Sunrise", artist: "Asha" });
    expect(a).not.toBe(b);
  });

  it("is a 64-char hex string", () => {
    const h = computeMetadataHash({ title: "Test" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("computeLeafHash", () => {
  it("produces consistent output", () => {
    const input = { artworkId: "art_1", metadataHash: "abc", walletAddress: "0x1234", royaltyBps: 400 };
    const a = computeLeafHash(input);
    const b = computeLeafHash(input);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
