import { afterEach, describe, expect, it, vi } from "vitest";

import { clientIp, mostRestrictive } from "@/lib/rate-limit";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off Vercel, trusts only the rightmost X-Forwarded-For hop (the one our proxy appended)", () => {
    vi.stubEnv("VERCEL", "");
    // A client sending `X-Forwarded-For: 6.6.6.6` gets its real IP appended.
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(h({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(h({}))).toBe("unknown");
  });

  it("on Vercel, uses the edge-set headers, preferring x-vercel-forwarded-for", () => {
    vi.stubEnv("VERCEL", "1");
    expect(
      clientIp(h({ "x-vercel-forwarded-for": "198.51.100.7", "x-forwarded-for": "10.0.0.1" }))
    ).toBe("198.51.100.7");
    expect(clientIp(h({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("buckets IPv6 by /64 so one subscriber cannot rotate addresses", () => {
    vi.stubEnv("VERCEL", "1");
    const a = clientIp(h({ "x-real-ip": "2001:db8:abcd:12::1" }));
    const b = clientIp(h({ "x-real-ip": "2001:0db8:abcd:0012:ffff:1:2:3" }));
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(b).toBe(a);
    expect(clientIp(h({ "x-real-ip": "::1" }))).toBe("0:0:0:0::/64");
    expect(clientIp(h({ "x-real-ip": "::ffff:203.0.113.9" }))).toBe("203.0.113.9");
  });
});

describe("store unavailable (PERF-2.03)", () => {
  afterEach(() => vi.unstubAllEnvs());

  // A real failure, not a mock: `.invalid` never resolves (RFC 2606), so the driver's
  // HTTP request fails exactly as it would during a database/network outage.
  async function downInstance() {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@ep-down.invalid/down");
    vi.resetModules();
    return import("@/lib/rate-limit");
  }
  const rule = { limit: 5, windowMs: 60_000 };

  it("fails CLOSED by default (auth, admin, writes): refused, 503, Retry-After", async () => {
    const { checkRateLimit, tooManyRequests } = await downInstance();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await checkRateLimit("auth/sign-in/email:ip:1.2.3.4", rule);
    expect(result).toMatchObject({ ok: false, unavailable: true });
    const res = tooManyRequests(result, {});
    expect(res.status).toBe(503);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("failing closed"), expect.anything());
    errors.mockRestore();
  });

  it("fails OPEN for public reads that opt in", async () => {
    const { checkRateLimit, limitRequest } = await downInstance();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkRateLimit("wall-search:ip:1.2.3.4", { ...rule, failOpen: true })).toMatchObject({
      ok: true,
      unavailable: true,
    });
    const h = new Headers({ "x-forwarded-for": "1.2.3.4" });
    expect((await limitRequest("pw-search", { ...rule, failOpen: true }, null, h)).ok).toBe(true);
    // Signed in: both the user and the IP bucket fail open.
    expect((await limitRequest("pw-search", { ...rule, failOpen: true }, "u1", h)).ok).toBe(true);
    expect((await limitRequest("upload", rule, "u1", h)).ok).toBe(false);
    errors.mockRestore();
  });
});

describe("mostRestrictive", () => {
  it("blocks if any bucket blocks and reports the longest wait", () => {
    expect(
      mostRestrictive([
        { ok: true, remaining: 3, retryAfter: 0 },
        { ok: false, remaining: 0, retryAfter: 42 },
      ])
    ).toEqual({ ok: false, remaining: 0, retryAfter: 42 });
  });
});
