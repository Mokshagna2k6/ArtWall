import { describe, expect, it } from "vitest";

import { formatBps } from "../money";

/**
 * Commission rates are shown to buyers before they commit money, so the
 * rendering must not quietly round a rate into a different number. These are
 * the cases the integer/string implementation can actually get wrong.
 */
describe("formatBps", () => {
  it("drops the decimal for a whole percentage", () => {
    expect(formatBps(1000)).toBe("10%");
    expect(formatBps(0)).toBe("0%");
    expect(formatBps(10000)).toBe("100%");
  });

  it("keeps a single decimal without padding it to two", () => {
    expect(formatBps(1250)).toBe("12.5%");
    expect(formatBps(50)).toBe("0.5%");
  });

  it("keeps two decimals where they carry information", () => {
    expect(formatBps(1234)).toBe("12.34%");
    expect(formatBps(1)).toBe("0.01%");
  });

  it("does not lose a leading zero in the fraction", () => {
    // 1005 is 10.05%, not 10.5% — the pad-then-trim must not eat the zero.
    expect(formatBps(1005)).toBe("10.05%");
  });
});
