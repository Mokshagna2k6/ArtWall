import { describe, expect, it } from "vitest";
import {
  buildCsp,
  buildCspReportOnly,
  hmacSha256Hex,
  isCloudinaryUrl,
  redact,
  redactString,
  roleSatisfies,
  safeEqual,
  STATIC_SECURITY_HEADERS,
  verifyHmacSha256,
} from "../index";

describe("hmac", () => {
  const sig = hmacSha256Hex("s3", "body");
  it("accepts a valid signature", () => expect(verifyHmacSha256("s3", "body", sig)).toBe(true));
  it("rejects tampered body, wrong secret, wrong length, missing inputs", () => {
    expect(verifyHmacSha256("s3", "body2", sig)).toBe(false);
    expect(verifyHmacSha256("other", "body", sig)).toBe(false);
    expect(verifyHmacSha256("s3", "body", sig.slice(1))).toBe(false);
    expect(verifyHmacSha256(undefined, "body", sig)).toBe(false);
    expect(verifyHmacSha256("s3", "body", null)).toBe(false);
  });
  it("safeEqual does not throw on length mismatch", () => expect(safeEqual("a", "ab")).toBe(false));
});

describe("allowlist", () => {
  it("allows only https res.cloudinary.com", () => {
    expect(isCloudinaryUrl("https://res.cloudinary.com/x/image/upload/a.jpg")).toBe(true);
    expect(isCloudinaryUrl("http://res.cloudinary.com/a.jpg")).toBe(false);
    expect(isCloudinaryUrl("https://res.cloudinary.com.evil.io/a.jpg")).toBe(false);
    expect(isCloudinaryUrl("https://res.cloudinary.com@evil.io/a.jpg")).toBe(false);
    expect(isCloudinaryUrl("https://evil.io/res.cloudinary.com")).toBe(false);
    expect(isCloudinaryUrl("not a url")).toBe(false);
    expect(isCloudinaryUrl(null)).toBe(false);
  });
});

describe("redaction", () => {
  it("masks emails, bearer tokens and DB urls", () => {
    expect(redactString("mail alice@example.com")).toBe("mail a***@example.com");
    expect(redactString("Authorization: Bearer abc.def")).toContain("Bearer [REDACTED]");
    expect(redactString("postgres://u:p@h/db")).toBe("postgres://[REDACTED]");
  });
  it("blanks sensitive keys deeply", () => {
    expect(redact({ a: { password: "x", n: 1 }, l: [{ apiKey: "k" }] })).toEqual({
      a: { password: "[REDACTED]", n: 1 },
      l: [{ apiKey: "[REDACTED]" }],
    });
  });
});

describe("headers", () => {
  it("enforced CSP keeps third parties and locks framing", () => {
    const csp = buildCsp({ nonce: "N" });
    expect(csp).toContain("'nonce-N'");
    expect(csp).toContain("https://checkout.razorpay.com");
    expect(csp).toContain("https://res.cloudinary.com");
    expect(csp).toContain("wss://*.walletconnect.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(buildCsp({ nonce: "N", isDev: true })).toContain("'unsafe-eval'");
  });
  it("report-only drops style unsafe-inline", () => {
    const ro = buildCspReportOnly({ nonce: "N" });
    expect(ro).not.toContain("'unsafe-inline'");
    expect(ro).toContain("style-src 'self' 'nonce-N'");
  });
  it("static headers include HSTS, referrer and permissions policy", () => {
    const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining(["Strict-Transport-Security", "Referrer-Policy", "Permissions-Policy"])
    );
  });
});

describe("authz", () => {
  it("is default-deny and hierarchical", () => {
    expect(roleSatisfies("admin", "staff")).toBe(true);
    expect(roleSatisfies("artist", "staff")).toBe(false);
    expect(roleSatisfies(null, "visitor")).toBe(false);
    expect(roleSatisfies("bogus" as never, "visitor")).toBe(false);
  });
});
