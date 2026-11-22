import { beforeEach, describe, expect, it } from "vitest";
import { generateQrSigningSeed, signQrToken, verifyQrToken } from "@/lib/blockchain/qr-signing";

describe("QR token signing (BC-3.11)", () => {
  beforeEach(() => {
    process.env.QR_SIGNING_ED25519_SEED = generateQrSigningSeed();
  });

  it("round-trips: a token signed for (tagId, artworkId) verifies and recovers them", () => {
    const token = signQrToken("tag_abc", "art_123");
    const verdict = verifyQrToken(token);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.payload.tagId).toBe("tag_abc");
      expect(verdict.payload.artworkId).toBe("art_123");
      expect(typeof verdict.payload.issuedAt).toBe("number");
    }
  });

  it("rejects a token signed under a different key", () => {
    const token = signQrToken("tag_abc", "art_123");
    process.env.QR_SIGNING_ED25519_SEED = generateQrSigningSeed(); // rotate key
    const verdict = verifyQrToken(token);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("bad_signature");
  });

  it("rejects a tampered payload (tagId swapped post-signature)", () => {
    const token = signQrToken("tag_abc", "art_123");
    const [, sig] = token.split(".");
    const tamperedPayload = JSON.stringify([1, "tag_EVIL", "art_123", Math.floor(Date.now() / 1000)]);
    const tamperedToken = `${Buffer.from(tamperedPayload).toString("base64url")}.${sig}`;
    const verdict = verifyQrToken(tamperedToken);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("bad_signature");
  });

  it("rejects a plain unsigned user-chosen string (BC-3.11: no longer a valid tag identity)", () => {
    const verdict = verifyQrToken("my-cool-tag-uid-i-made-up");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("malformed");
  });

  it("rejects garbage base64 gracefully (no throw)", () => {
    expect(() => verifyQrToken("not.base64!!")).not.toThrow();
  });

  it("generateQrSigningSeed produces a valid 32-byte hex seed each time, non-repeating", () => {
    const a = generateQrSigningSeed();
    const b = generateQrSigningSeed();
    expect(a).toHaveLength(64);
    expect(b).toHaveLength(64);
    expect(a).not.toBe(b);
  });
});
