import { describe, it, expect } from "vitest";
import { verifyCid } from "@/lib/blockchain/cid";

describe("verifyCid (BC-2.08)", () => {
  const bytes = new TextEncoder().encode("hello world");

  // Both vectors were cross-checked against the reference `multiformats`
  // library (CID.create(1, raw.code, await sha256.digest(bytes)) and
  // base58btc.encode(digest.bytes).slice(1)) for the UTF-8 bytes of
  // "hello world", not transcribed from memory.
  const knownCidV1Raw = "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e";
  const knownCidV0 = "QmaozNR7DZHQK1ZcU9p7QdrshMvXqWK6gpu5rmrkPdT3L4";

  it("accepts the reference-verified CIDv1 raw-codec sha2-256 CID for 'hello world'", () => {
    const verdict = verifyCid(bytes, knownCidV1Raw);
    expect(verdict.verified).toBe(true);
  });

  it("accepts the reference-verified CIDv0 for 'hello world'", () => {
    const verdict = verifyCid(bytes, knownCidV0);
    expect(verdict.verified).toBe(true);
  });

  it("rejects a CIDv1 that does not match the given bytes", () => {
    const tampered = new TextEncoder().encode("hello world!");
    const verdict = verifyCid(tampered, knownCidV1Raw);
    expect(verdict.verified).toBe(false);
  });

  it("rejects a CIDv0 that does not match the given bytes", () => {
    const tampered = new TextEncoder().encode("hello world!");
    const verdict = verifyCid(tampered, knownCidV0);
    expect(verdict.verified).toBe(false);
  });

  it("reports an unsupported CID format rather than silently trusting it", () => {
    const verdict = verifyCid(bytes, "not-a-real-cid");
    if (verdict.verified) throw new Error("expected verification to fail");
    expect(verdict.reason).toMatch(/unsupported/);
  });

  it("reports no CID returned as unverified", () => {
    const verdict = verifyCid(bytes, "");
    expect(verdict.verified).toBe(false);
  });
});
