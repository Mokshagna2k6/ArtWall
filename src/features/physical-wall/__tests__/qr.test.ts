import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("server-only", () => ({}));

const MOCK_SECRET = "test-secret-for-qr-tokens-only";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = MOCK_SECRET;
});

afterAll(() => {
  delete process.env.BETTER_AUTH_SECRET;
});

describe("mintQrToken", () => {
  it("produces a two-part dot-separated token", async () => {
    const { mintQrToken } = await import("../qr");
    const token = mintQrToken();
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it("generates unique tokens on each call", async () => {
    const { mintQrToken } = await import("../qr");
    const tokens = new Set(Array.from({ length: 100 }, () => mintQrToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("verifyQrToken", () => {
  it("verifies a token it just minted", async () => {
    const { mintQrToken, verifyQrToken } = await import("../qr");
    const token = mintQrToken();
    expect(verifyQrToken(token)).toBe(true);
  });

  it("rejects null/undefined/empty", async () => {
    const { verifyQrToken } = await import("../qr");
    expect(verifyQrToken(null)).toBe(false);
    expect(verifyQrToken(undefined)).toBe(false);
    expect(verifyQrToken("")).toBe(false);
  });

  it("rejects a token with no dot", async () => {
    const { verifyQrToken } = await import("../qr");
    expect(verifyQrToken("nodothere")).toBe(false);
  });

  it("rejects a tampered id", async () => {
    const { mintQrToken, verifyQrToken } = await import("../qr");
    const token = mintQrToken();
    const [id, sig] = token.split(".");
    const tampered = `X${id.slice(1)}.${sig}`;
    expect(verifyQrToken(tampered)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const { mintQrToken, verifyQrToken } = await import("../qr");
    const token = mintQrToken();
    const [id, sig] = token.split(".");
    const tampered = `${id}.X${sig.slice(1)}`;
    expect(verifyQrToken(tampered)).toBe(false);
  });

  it("rejects a completely fabricated token", async () => {
    const { verifyQrToken } = await import("../qr");
    expect(verifyQrToken("AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAA")).toBe(
      false
    );
  });
});

describe("qrUrl", () => {
  it("builds a /q/ URL", async () => {
    const { qrUrl } = await import("../qr");
    const url = qrUrl("abc.xyz", "https://artwall.in");
    expect(url).toBe("https://artwall.in/q/abc.xyz");
  });

  it("strips trailing slash from origin", async () => {
    const { qrUrl } = await import("../qr");
    const url = qrUrl("abc.xyz", "https://artwall.in/");
    expect(url).toBe("https://artwall.in/q/abc.xyz");
  });
});
