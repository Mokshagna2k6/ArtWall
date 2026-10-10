import { describe, expect, it } from "vitest";

import {
  collectorPainPoints,
  galleryPainPoints,
  OTHER_PAIN_POINT,
  painPoints,
  surveySchema,
} from "@/features/survey/schema";

function base(overrides: Record<string, unknown> = {}) {
  return {
    role: "artist",
    painPoints: [painPoints[0]],
    ...overrides,
  };
}

describe("survey schema - persona branching", () => {
  it("accepts an artist's own pain points", () => {
    expect(surveySchema.safeParse(base()).success).toBe(true);
  });

  it("accepts a collector's pain points only under role: collector", () => {
    const asCollector = surveySchema.safeParse(
      base({ role: "collector", painPoints: [collectorPainPoints[0]] })
    );
    expect(asCollector.success).toBe(true);

    // The same option is meaningless for the role "artist" claims - a
    // collector-only pain point smuggled in under role "artist" must fail.
    const mismatched = surveySchema.safeParse(
      base({ role: "artist", painPoints: [collectorPainPoints[0]] })
    );
    expect(mismatched.success).toBe(false);
  });

  it("accepts a gallery's pain points only under role: gallery", () => {
    expect(
      surveySchema.safeParse(
        base({ role: "gallery", painPoints: [galleryPainPoints[0]] })
      ).success
    ).toBe(true);
  });
});

describe("survey schema - \"Other\" escape hatch", () => {
  it("rejects \"Something else\" with no free-text detail", () => {
    const result = surveySchema.safeParse(
      base({ painPoints: [OTHER_PAIN_POINT], otherPainPointDetail: "" })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const field = result.error.issues.find(
        (issue) => issue.path[0] === "otherPainPointDetail"
      );
      expect(field).toBeDefined();
    }
  });

  it("accepts \"Something else\" once the free text is filled in, and the text round-trips", () => {
    const result = surveySchema.safeParse(
      base({
        painPoints: [OTHER_PAIN_POINT],
        otherPainPointDetail: "Shipping insurance is impossible to get.",
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.otherPainPointDetail).toBe(
        "Shipping insurance is impossible to get."
      );
    }
  });

  it("every persona's pain-point list ends with the same Other option", () => {
    expect(painPoints.at(-1)).toBe(OTHER_PAIN_POINT);
    expect(collectorPainPoints.at(-1)).toBe(OTHER_PAIN_POINT);
    expect(galleryPainPoints.at(-1)).toBe(OTHER_PAIN_POINT);
  });
});
