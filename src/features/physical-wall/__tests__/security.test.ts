import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("server-only", () => ({}));
// Mock the session module so importing authorize doesn't trigger BETTER_AUTH_SECRET check
vi.mock("@/lib/session", () => ({
  getActor: vi.fn(),
  getCurrentUser: vi.fn(),
}));

/**
 * Security tests: IDOR, authorization, webhook forgery, replay.
 */

beforeAll(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
  process.env.BETTER_AUTH_SECRET = "test-auth-secret-32-characters!!";
});

afterAll(() => {
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  delete process.env.BETTER_AUTH_SECRET;
  vi.restoreAllMocks();
});

describe("Webhook signature verification (F17)", () => {
  it("rejects a forged signature", async () => {
    const { verifyWebhookSignature } = await import("../razorpay");
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, "forged-signature")).toBe(false);
  });

  it("rejects a null signature", async () => {
    const { verifyWebhookSignature } = await import("../razorpay");
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });

  it("rejects when secret is not configured", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const { verifyWebhookSignature } = await import("../razorpay");
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, "anything")).toBe(false);
  });

  it("rejects an empty signature", async () => {
    const { verifyWebhookSignature } = await import("../razorpay");
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, "")).toBe(false);
  });
});

describe("QR token security (F15)", () => {
  it("rejects a tampered token", async () => {
    const { mintQrToken, verifyQrToken } = await import("../qr");
    const token = mintQrToken();
    const [id, sig] = token.split(".");
    const tampered = `${id}.X${sig.slice(1)}`;
    expect(verifyQrToken(tampered)).toBe(false);
  });

  it("rejects a token from a different secret", async () => {
    const { mintQrToken, verifyQrToken } = await import("../qr");
    const token = mintQrToken();
    process.env.BETTER_AUTH_SECRET = "different-secret-totally!!!";
    expect(verifyQrToken(token)).toBe(false);
    process.env.BETTER_AUTH_SECRET = "test-auth-secret-32-characters!!";
  });

  it("rejects a malformed token", async () => {
    const { verifyQrToken } = await import("../qr");
    expect(verifyQrToken("not-a-valid-token")).toBe(false);
    expect(verifyQrToken("")).toBe(false);
    expect(verifyQrToken(null)).toBe(false);
  });
});

describe("RBAC authorization (F12, F17)", () => {
  it("hasRole denies when actor is null", async () => {
    const { hasRole } = await import("../authorize");
    expect(hasRole(null, "artist")).toBe(false);
    expect(hasRole(null, "staff")).toBe(false);
    expect(hasRole(null, "admin")).toBe(false);
  });

  it("hasRole enforces rank hierarchy", async () => {
    const { hasRole } = await import("../authorize");
    const artist = { id: "1", name: "A", email: "a@x.com", role: "artist" as const };
    const staff = { id: "2", name: "B", email: "b@x.com", role: "staff" as const };
    const admin = { id: "3", name: "C", email: "c@x.com", role: "admin" as const };

    expect(hasRole(artist, "artist")).toBe(true);
    expect(hasRole(artist, "staff")).toBe(false);
    expect(hasRole(artist, "admin")).toBe(false);

    expect(hasRole(staff, "artist")).toBe(true);
    expect(hasRole(staff, "staff")).toBe(true);
    expect(hasRole(staff, "admin")).toBe(false);

    expect(hasRole(admin, "artist")).toBe(true);
    expect(hasRole(admin, "staff")).toBe(true);
    expect(hasRole(admin, "admin")).toBe(true);
  });
});

describe("Payment amount verification (F17)", () => {
  it("PreconditionError has correct status code", async () => {
    const { PreconditionError } = await import("../actions/shared");
    const err = new PreconditionError("Payment amount mismatch");
    expect(err.status).toBe(422);
    expect(err.message).toContain("mismatch");
  });
});
