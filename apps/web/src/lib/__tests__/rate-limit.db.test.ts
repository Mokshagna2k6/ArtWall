import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

/**
 * The shared limiter against the real database. Each "instance" is a fresh
 * module graph (vi.resetModules), so it has its own Neon client and module
 * state - the same isolation two serverless invocations have. They must still
 * agree on one count, because the only shared thing is the rate_limits table.
 */
async function freshInstance() {
  vi.resetModules();
  return import("@/lib/rate-limit");
}

describe("rate limiter (Postgres-backed)", () => {
  it("shares one exact count across instances under concurrent load", async () => {
    const a = await freshInstance();
    const b = await freshInstance();
    expect(a).not.toBe(b);

    const key = `test:${randomUUID()}`;
    const rule = { limit: 12, windowMs: 60_000 };
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).checkRateLimit(key, rule))
    );

    expect(results.filter((r) => r.ok)).toHaveLength(12);
    const blocked = results.filter((r) => !r.ok);
    expect(blocked).toHaveLength(8);
    for (const r of blocked) {
      expect(r.retryAfter).toBeGreaterThanOrEqual(1);
      expect(r.retryAfter).toBeLessThanOrEqual(60);
    }
  });

  it("opens a fresh window once the old one expires", async () => {
    const { checkRateLimit } = await freshInstance();
    const key = `test:${randomUUID()}`;
    const rule = { limit: 1, windowMs: 1_500 };

    expect((await checkRateLimit(key, rule)).ok).toBe(true);
    const blocked = await checkRateLimit(key, rule);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(2); // ceil of ~1.4s left

    await new Promise((r) => setTimeout(r, 1_700));
    expect((await checkRateLimit(key, rule)).ok).toBe(true);
  });

  it("limits a signed-in user across networks, but not NAT neighbours", async () => {
    const { limitRequest } = await freshInstance();
    const scope = `test:${randomUUID()}`;
    const rule = { limit: 3, windowMs: 60_000 };
    const from = (ip: string) => new Headers({ "x-forwarded-for": ip });

    // One user hopping networks: the per-user bucket still stops the 4th call.
    const hops = [];
    for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"]) {
      hops.push(await limitRequest(scope, rule, "user-a", from(ip)));
    }
    expect(hops.map((r) => r.ok)).toEqual([true, true, true, false]);

    // Five users behind one NAT each get their own 3 (IP ceiling is 3 x 5 = 15).
    const nat = from("9.9.9.9");
    const office = await Promise.all(
      ["u1", "u2", "u3", "u4", "u5"].flatMap((u) =>
        [0, 1, 2].map(() => limitRequest(scope, rule, u, nat))
      )
    );
    expect(office.every((r) => r.ok)).toBe(true);
    // ...but a sixth account on the same IP hits the IP ceiling.
    expect((await limitRequest(scope, rule, "u6", nat)).ok).toBe(false);
  });

  it("returns 429 with Retry-After from the remaining window", async () => {
    const { checkRateLimit, tooManyRequests } = await freshInstance();
    const key = `test:${randomUUID()}`;
    const rule = { limit: 1, windowMs: 90_000 };
    await checkRateLimit(key, rule);
    const res = tooManyRequests(await checkRateLimit(key, rule), { error: "x" });
    expect(res.status).toBe(429);
    const retry = Number(res.headers.get("Retry-After"));
    expect(retry).toBeGreaterThan(85);
    expect(retry).toBeLessThanOrEqual(90);
  });
});
