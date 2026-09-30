import { describe, it, expect } from "vitest";

import { computeMetadataHash } from "@/features/coa/hash";

// computeLeafHash is covered in merkle.test.ts against a reference keccak.
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
    expect(computeMetadataHash({ title: "Test", artist: "A" })).toMatch(/^[0-9a-f]{64}$/);
  });
});
