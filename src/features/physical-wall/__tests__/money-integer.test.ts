import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { applyBp, assertPaise, BP } from "@/features/physical-wall/money";
import { quote, refundAmountPaise } from "@/features/physical-wall/pricing";

/**
 * BE-2.26: server-side money is integer paise only.
 *
 * Two checks. Behavioural: the shared arithmetic is exact against a BigInt
 * reference and refuses fractional input. Static: the invoice and settlement
 * paths contain no float-producing constructs, so a `total * 0.18` or a
 * `/ 100` rupee conversion cannot creep back in unnoticed.
 */

const MONEY_PATHS = [
  "src/features/physical-wall/money.ts",
  "src/features/physical-wall/gst.ts",
  "src/features/physical-wall/pricing.ts",
  "src/features/physical-wall/settlement.ts",
  "src/features/physical-wall/refunds.ts",
  "src/features/physical-wall/actions/invoice.ts",
  "src/features/physical-wall/actions/payment.ts",
];

// Presentation helpers are the one place rupees exist; they are named, not guessed.
const DISPLAY_ONLY = /export function (toRupees|formatINR)[\s\S]*?\n}\n/g;

const FLOAT_PATTERNS: [RegExp, string][] = [
  [/parseFloat\s*\(/, "parseFloat"],
  [/\.toFixed\s*\(/, "toFixed"],
  [/(?<![\w.])\d+\.\d+(?![\w.])/, "a decimal literal"],
  [/\/\s*100(?![\d_])/, "a divide-by-100 rupee conversion"],
  [/\*\s*0\.\d/, "a fractional multiplier"],
];

function code(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(DISPLAY_ONLY, "")
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1") // line comments
    .replace(/`(?:[^`\\]|\\.)*`/g, (s) => s.replace(/\d+\.\d+/g, "")) // SQL text isn't JS math
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

describe("no float math in invoice / settlement paths (static)", () => {
  for (const path of MONEY_PATHS) {
    it(path, () => {
      const src = code(path);
      for (const [pattern, what] of FLOAT_PATTERNS) {
        expect(pattern.test(src), `${path} contains ${what}`).toBe(false);
      }
    });
  }
});

describe("integer paise arithmetic (behavioural)", () => {
  const reference = (amount: bigint, bp: bigint) => {
    const num = 2n * amount * bp + 10_000n;
    return num / 20_000n; // amounts here are non-negative
  };

  it("applyBp is exact against BigInt for amounts up to ₹90 lakh crore", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31);
    for (let i = 0; i < 5000; i++) {
      const amount = (rand() * 2 ** 21 + rand()) % 9e14;
      const bp = rand() % 20_001;
      expect(applyBp(amount, bp)).toBe(Number(reference(BigInt(amount), BigInt(bp))));
    }
    // A product past 2^53 — where float math silently loses paise.
    expect(applyBp(900_000_000_000_001, 1800)).toBe(162_000_000_000_000);
  });

  it("refuses fractional paise and fractional basis points", () => {
    expect(() => applyBp(100.5, 1800)).toThrow(TypeError);
    expect(() => applyBp(100, 18.5)).toThrow(TypeError);
    expect(() => assertPaise(Number.NaN)).toThrow(TypeError);
    expect(() => assertPaise(2 ** 53)).toThrow(TypeError);
    expect(() => refundAmountPaise(11_800, 50)).not.toThrow();
  });

  it("every figure a quote produces is an integer, and the total reconciles", () => {
    const q = quote({
      slots: [
        { slotId: "a", basePricePaise: 33_333, typeMultiplierBp: 12_345 },
        { slotId: "b", basePricePaise: 77_777, typeMultiplierBp: 9_999 },
      ],
      durationDays: 13,
      addons: [{ addonId: "x", label: "Lighting", pricePaise: 49_999 }],
      occupancyPct: 95,
      settings: {
        gstRateBp: 1800,
        surgeEnabled: true,
        surgeThresholdPct: 80,
        surgeMultiplierBp: 11_500,
        groupDiscountTiers: [{ minSlots: 2, percentBp: 750 }],
      } as never,
      totalSlots: 100,
    });
    for (const [k, v] of Object.entries(q)) if (typeof v === "number") expect(Number.isSafeInteger(v), k).toBe(true);
    expect(q.totalPaise).toBe(q.basePaise - q.discountPaise + q.addonsPaise + q.gstPaise);
    expect(BP).toBe(10_000);
  });
});
