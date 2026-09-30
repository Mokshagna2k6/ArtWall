import { describe, expect, it } from "vitest";

import { runDemandAggregation } from "../aggregate";

describe("runDemandAggregation (PERF-3.04, blocked on DB-3.14)", () => {
  it("throws rather than silently no-op'ing until the Demand Engine tables exist", async () => {
    await expect(runDemandAggregation()).rejects.toThrow(/blocked on Database Phase 3/);
  });
});
