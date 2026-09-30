import { describe, expect, it, vi } from "vitest";

const { limitRequest } = vi.hoisted(() => ({
  limitRequest: vi.fn(async (_scope: string, rule: { limit: number; windowMs: number }, _userId?: string, _h?: Headers) => ({
    ok: true,
    remaining: 1,
    retryAfter: 0,
  })),
}));
vi.mock("@/lib/rate-limit", () => ({ limitRequest, retryIn: () => "a minute" }));

import { limitPolicyOperation } from "../rate-limit";

describe("limitPolicyOperation", () => {
  it("keys the scope by operation and forwards the per-role limit", async () => {
    await limitPolicyOperation("mint", "artist", "u1");
    expect(limitRequest).toHaveBeenCalledWith(
      "policy:mint",
      { limit: 10, windowMs: 60 * 60 * 1000 },
      "u1",
      undefined
    );
  });

  it("gives staff/admin a higher ceiling than artist for the same operation", async () => {
    await limitPolicyOperation("list", "staff", "u2");
    const staffRule = limitRequest.mock.calls.at(-1)![1];
    await limitPolicyOperation("list", "artist", "u3");
    const artistRule = limitRequest.mock.calls.at(-1)![1];
    expect(staffRule.limit).toBeGreaterThan(artistRule.limit);
  });

  it("blocks visitors outright on every gated operation", async () => {
    for (const op of ["mint", "list", "secondarySell"] as const) {
      await limitPolicyOperation(op, "visitor", "u4");
      const rule = limitRequest.mock.calls.at(-1)![1];
      expect(rule.limit).toBe(0);
    }
  });
});
