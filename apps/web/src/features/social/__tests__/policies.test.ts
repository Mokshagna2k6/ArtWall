import { describe, expect, it } from "vitest";
import { POLICIES, getPolicy } from "@artwall/ratelimit";

describe("social rate-limit policies", () => {
  it("defines the three social policies and fails them CLOSED", () => {
    for (const name of ["comment", "social-action", "endorsement"] as const) {
      const p = getPolicy(name);
      expect(p.failOpen, `${name} must fail closed`).toBe(false);
      expect(p.limit).toBeGreaterThan(0);
    }
  });

  it("keeps comments tighter than generic social actions", () => {
    expect(getPolicy("comment").limit).toBeLessThan(getPolicy("social-action").limit);
  });

  it("keeps endorsements tighter than generic social actions", () => {
    expect(getPolicy("endorsement").limit).toBeLessThan(getPolicy("social-action").limit);
  });
});
