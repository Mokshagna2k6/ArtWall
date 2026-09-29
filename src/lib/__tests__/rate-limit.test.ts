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
