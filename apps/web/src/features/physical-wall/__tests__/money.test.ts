import { describe, it, expect } from "vitest";
import { BP, applyBp, toPaise, toRupees, formatINR } from "../money";

describe("BP constant", () => {
  it("is 10 000", () => {
    expect(BP).toBe(10_000);
  });
});

describe("applyBp", () => {
  it("1x multiplier returns the amount unchanged", () => {
    expect(applyBp(50000, BP)).toBe(50000);
  });

  it("applies 18% GST correctly", () => {
    // 1800 bp = 18%
    expect(applyBp(100_00, 1800)).toBe(18_00);
  });

  it("applies 10% discount", () => {
    expect(applyBp(100_00, 1000)).toBe(10_00);
  });

  it("rounds half-up", () => {
    // 3 * 5000 / 10000 = 1.5 -> rounds to 2
    expect(applyBp(3, 5000)).toBe(2);
  });

  it("handles zero amount", () => {
    expect(applyBp(0, 5000)).toBe(0);
  });

  it("handles zero bp", () => {
    expect(applyBp(50000, 0)).toBe(0);
  });

  it("handles large amounts without overflow", () => {
    // ₹10,00,000 in paise = 10_00_00_000
    const tenLakhPaise = 10_00_00_000;
    expect(applyBp(tenLakhPaise, 1800)).toBe(1_80_00_000);
  });
});

describe("toPaise", () => {
  it("converts whole rupees", () => {
    expect(toPaise(500)).toBe(50000);
  });

  it("converts string rupees", () => {
    expect(toPaise("500")).toBe(50000);
  });

  it("converts fractional rupees", () => {
    expect(toPaise(99.5)).toBe(9950);
  });

  it("converts string with whitespace", () => {
    expect(toPaise("  250  ")).toBe(25000);
  });

  it("returns null for negative", () => {
    expect(toPaise(-100)).toBeNull();
  });

  it("returns null for NaN", () => {
    expect(toPaise("abc")).toBeNull();
  });

  it("returns null for Infinity", () => {
    expect(toPaise(Infinity)).toBeNull();
  });

  it("converts zero", () => {
    expect(toPaise(0)).toBe(0);
  });

  it("rounds sub-paise fractions", () => {
    // 10.5 rupees = 1050 paise exactly
    expect(toPaise(10.5)).toBe(1050);
    // 10.255 * 100 = 1025.5 -> Math.round -> 1026
    expect(toPaise("10.255")).toBe(1026);
  });
});

describe("toRupees", () => {
  it("converts paise to rupees", () => {
    expect(toRupees(50000)).toBe(500);
  });

  it("preserves fractional rupees", () => {
    expect(toRupees(9950)).toBe(99.5);
  });

  it("converts zero", () => {
    expect(toRupees(0)).toBe(0);
  });
});

describe("formatINR", () => {
  it("formats whole rupees without decimals", () => {
    const result = formatINR(600000);
    expect(result).toContain("6,000");
  });

  it("formats with paise when present", () => {
    const result = formatINR(600050);
    expect(result).toContain("6,000.50");
  });

  it("uses Indian digit grouping for lakhs", () => {
    const result = formatINR(10_00_00_000); // ₹10,00,000
    expect(result).toContain("10,00,000");
  });

  it("formats zero", () => {
    const result = formatINR(0);
    expect(result).toContain("0");
  });
});
