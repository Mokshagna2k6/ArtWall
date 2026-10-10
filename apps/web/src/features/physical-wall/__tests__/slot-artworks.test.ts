import { describe, expect, it } from "vitest";

import { reserveSchema } from "@/features/physical-wall/schema";

const base = { slotIds: ["s1", "s2"], durationDays: 7, startDate: "2031-03-01" };

describe("reserveSchema slotArtworks (0064)", () => {
  it("defaults to no assignments", () => {
    expect(reserveSchema.parse(base).slotArtworks).toEqual([]);
  });

  it("accepts one artwork per slot of the basket", () => {
    const r = reserveSchema.safeParse({
      ...base,
      slotArtworks: [{ slotId: "s1", artworkId: "a1" }, { slotId: "s2", artworkId: "a2" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a repeated artwork, a repeated slot, and a slot outside the basket", () => {
    const bad = (slotArtworks: unknown) => reserveSchema.safeParse({ ...base, slotArtworks }).success;
    expect(bad([{ slotId: "s1", artworkId: "a1" }, { slotId: "s2", artworkId: "a1" }])).toBe(false);
    expect(bad([{ slotId: "s1", artworkId: "a1" }, { slotId: "s1", artworkId: "a2" }])).toBe(false);
    expect(bad([{ slotId: "s9", artworkId: "a1" }])).toBe(false);
  });
});
