import { describe, expect, it } from "vitest";

import {
  fiscalYear,
  formatInvoiceNumber,
  invoiceAmounts,
  splitGst,
  stateCodeFromGstin,
} from "@/features/physical-wall/gst";
import { applyBp } from "@/features/physical-wall/money";

/** BE-2.04 (unit half; numbering under concurrency is in invoices.db.test.ts). */
describe("GST split", () => {
  it("intra-state: CGST + SGST, halves of the GST, nothing on IGST", () => {
    expect(splitGst(1800, "08", "08")).toEqual({ cgstPaise: 900, sgstPaise: 900, igstPaise: 0, intraState: true });
  });

  it("inter-state: all of it IGST", () => {
    expect(splitGst(1800, "08", "27")).toEqual({ cgstPaise: 0, sgstPaise: 0, igstPaise: 1800, intraState: false });
  });

  it("odd paisa: CGST takes the extra paisa, the halves still add up to the GST exactly", () => {
    for (const gst of [1, 3, 1801, 99_999, 12_345_677]) {
      const { cgstPaise, sgstPaise } = splitGst(gst, "08", "08");
      expect(cgstPaise + sgstPaise).toBe(gst);
      expect(cgstPaise - sgstPaise).toBe(1);
      expect(Number.isInteger(cgstPaise) && Number.isInteger(sgstPaise)).toBe(true);
    }
  });

  it("refuses non-integer paise instead of rounding silently", () => {
    expect(() => splitGst(18.5, "08", "08")).toThrow(/integer/);
  });
});

describe("invoice amounts", () => {
  it("lines add up to the total for every total/GST pair (intra and inter)", () => {
    for (let total = 100; total < 200_000; total += 997) {
      const gst = applyBp(total, 1800) - applyBp(total, 1800) % 7; // arbitrary integer ≤ total
      for (const pos of ["08", "29"]) {
        const a = invoiceAmounts(total, gst, "08", pos);
        expect(a.netPaise + a.cgstPaise + a.sgstPaise + a.igstPaise).toBe(total);
        expect(a.intraState ? a.igstPaise : a.cgstPaise + a.sgstPaise).toBe(0);
      }
    }
  });

  it("a booking quoted at 18% on ₹100.01 rounds GST to the paisa, half-up", () => {
    // 10001 × 18% = 1800.18 → 1800; 10003 × 18% = 1800.54 → 1801
    expect(applyBp(10_001, 1800)).toBe(1800);
    expect(applyBp(10_003, 1800)).toBe(1801);
    // exactly half a paisa rounds up: 25 × 18% = 4.5 → 5
    expect(applyBp(25, 1800)).toBe(5);
  });

  it("rejects inconsistent or fractional amounts", () => {
    expect(() => invoiceAmounts(100, 200, "08", "08")).toThrow();
    expect(() => invoiceAmounts(100, -1, "08", "08")).toThrow();
    expect(() => invoiceAmounts(100.5, 18, "08", "08")).toThrow();
  });
});

describe("invoice numbering format", () => {
  it("financial year runs April–March", () => {
    expect(fiscalYear("2026-04-01")).toBe("2026-27");
    expect(fiscalYear("2027-03-31")).toBe("2026-27");
    expect(fiscalYear("2027-01-15")).toBe("2026-27");
    expect(fiscalYear("2099-12-31")).toBe("2099-00");
  });

  it("zero-pads to four digits and keeps growing past 9999", () => {
    expect(formatInvoiceNumber("2026-27", 7)).toBe("AW/2026-27/0007");
    expect(formatInvoiceNumber("2026-27", 12345)).toBe("AW/2026-27/12345");
  });

  it("GSTIN state codes", () => {
    expect(stateCodeFromGstin("27AAPFU0939F1ZV")).toBe("27");
    expect(stateCodeFromGstin("99AAPFU0939F1ZV")).toBeNull();
    expect(stateCodeFromGstin("nope")).toBeNull();
  });
});
