import { describe, expect, it } from "vitest";

import { buildChecklist, isListedForSale, type ChecklistInput } from "@/features/studio/checklist";

/**
 * The point of these tests: the checklist must never claim progress that the
 * underlying state does not support. An empty studio is 0/7, not "almost there".
 */

const emptyStudio: ChecklistInput = {
  profile: {
    displayName: "Asha",
    bio: null,
    avatarUrl: null,
    location: null,
    published: false,
  },
  artworks: [],
  certificateCount: 0,
  linkedTagCount: 0,
  collectionCount: 0,
};

describe("buildChecklist", () => {
  it("reports 0/7 and 0% for a brand-new studio", () => {
    const result = buildChecklist(emptyStudio);
    expect(result.total).toBe(7);
    expect(result.completed).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.steps.every((s) => !s.done)).toBe(true);
  });

  it("reports 7/7 and 100% only when every step is genuinely satisfied", () => {
    const result = buildChecklist({
      profile: {
        displayName: "Asha",
        bio: "Painter in Kochi.",
        avatarUrl: "https://example.test/a.jpg",
        location: "Kochi",
        published: true,
      },
      artworks: [{ status: "available", isPublic: true, pricePaise: 250_000 }],
      certificateCount: 1,
      linkedTagCount: 1,
      collectionCount: 1,
    });
    expect(result.completed).toBe(7);
    expect(result.percent).toBe(100);
  });

  it("does not count a half-filled profile as complete", () => {
    const result = buildChecklist({
      ...emptyStudio,
      profile: { ...emptyStudio.profile, bio: "Painter.", avatarUrl: null, location: "Kochi" },
    });
    expect(result.steps.find((s) => s.id === "profile")?.done).toBe(false);
  });

  it("counts an artwork but not a sale listing when the work has no price", () => {
    const result = buildChecklist({
      ...emptyStudio,
      artworks: [{ status: "available", isPublic: true, pricePaise: null }],
    });
    expect(result.steps.find((s) => s.id === "artwork")?.done).toBe(true);
    expect(result.steps.find((s) => s.id === "listed")?.done).toBe(false);
    expect(result.completed).toBe(1);
  });

  it("floors the percentage rather than rounding progress up", () => {
    // 1 of 7 = 14.28…%
    const result = buildChecklist({ ...emptyStudio, certificateCount: 1 });
    expect(result.percent).toBe(14);
  });
});

describe("isListedForSale", () => {
  it("requires public, available and priced together", () => {
    expect(isListedForSale({ status: "available", isPublic: true, pricePaise: 100 })).toBe(true);
    expect(isListedForSale({ status: "available", isPublic: false, pricePaise: 100 })).toBe(false);
    expect(isListedForSale({ status: "sold", isPublic: true, pricePaise: 100 })).toBe(false);
    expect(isListedForSale({ status: "available", isPublic: true, pricePaise: null })).toBe(false);
  });
});
