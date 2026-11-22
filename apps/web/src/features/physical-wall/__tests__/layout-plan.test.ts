import { describe, expect, it } from "vitest";

import { MAX_COLS, MAX_ROWS, planLayout, slotLabel } from "../layout-plan";

/**
 * The generator's arithmetic. The one thing that must never be wrong is the
 * gap count: N frames across a run have N+1 gaps, not N-1, because the wall's
 * own edges each take one. Getting that wrong overfills a real wall, which is
 * only discovered on site with a drill in hand.
 */
describe("planLayout", () => {
  it("counts the outer gaps, not just the ones between frames", () => {
    // 3 frames of 50cm + 4 gaps of 10cm = 190cm, which fits 200cm.
    // A 4th frame would need 240cm + 50 gaps, so it must not be counted.
    const plan = planLayout({
      wallWidthCm: 200,
      wallHeightCm: 100,
      slotWidthCm: 50,
      slotHeightCm: 50,
      gapCm: 10,
    });

    expect(plan.colCount).toBe(3);
    expect(plan.usedWidthCm).toBe(190);
    expect(plan.leftoverWidthCm).toBe(10);
    expect(plan.problem).toBeNull();
  });

  it("multiplies rows by columns for the slot count", () => {
    const plan = planLayout({
      wallWidthCm: 200,
      wallHeightCm: 200,
      slotWidthCm: 50,
      slotHeightCm: 50,
      gapCm: 10,
    });

    expect(plan.rowCount).toBe(3);
    expect(plan.colCount).toBe(3);
    expect(plan.slotCount).toBe(9);
  });

  it("handles a zero gap without dividing by zero or losing a frame", () => {
    const plan = planLayout({
      wallWidthCm: 200,
      wallHeightCm: 50,
      slotWidthCm: 50,
      slotHeightCm: 50,
      gapCm: 0,
    });

    expect(plan.colCount).toBe(4);
    expect(plan.usedWidthCm).toBe(200);
    expect(plan.leftoverWidthCm).toBe(0);
  });

  it("reports a problem instead of an empty grid when nothing fits", () => {
    const plan = planLayout({
      wallWidthCm: 40,
      wallHeightCm: 40,
      slotWidthCm: 100,
      slotHeightCm: 100,
      gapCm: 10,
    });

    expect(plan.slotCount).toBe(0);
    expect(plan.problem).toMatch(/does not fit/);
  });

  it("clamps an enormous wall to the editor's limit and says so", () => {
    const plan = planLayout({
      wallWidthCm: 5000,
      wallHeightCm: 1000,
      slotWidthCm: 10,
      slotHeightCm: 10,
      gapCm: 0,
    });

    expect(plan.colCount).toBe(MAX_COLS);
    expect(plan.rowCount).toBe(MAX_ROWS);
    expect(plan.problem).toMatch(/more than the/);
  });

  it("refuses a size class with no dimensions rather than planning zero slots silently", () => {
    const plan = planLayout({
      wallWidthCm: 200,
      wallHeightCm: 200,
      slotWidthCm: 0,
      slotHeightCm: 50,
      gapCm: 10,
    });

    expect(plan.problem).toMatch(/no dimensions/);
  });
});

describe("slotLabel", () => {
  it("labels spreadsheet-style, 1-indexed columns", () => {
    expect(slotLabel(0, 0)).toBe("A1");
    expect(slotLabel(1, 2)).toBe("B3");
  });
});
