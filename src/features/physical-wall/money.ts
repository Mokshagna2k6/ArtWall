/**
 * Money, in paise.
 *
 * Every amount that crosses the physical wall — a slot's base price, an add-on,
 * GST, a Platter bill — is an integer number of paise. Rupee floats plus an 18%
 * tax line plus a 10% partner discount is three chances to lose a fraction of a
 * rupee, and the errors compound in the ledger. Integers have none of that.
 *
 * Conversion happens at the edges only: `toPaise` when a number comes in from a
 * form, `formatINR` when one goes out to a screen. Nothing in between converts.
 *
 * Safe to import from a client component: this file is pure arithmetic.
 */

/** Basis points. 10000 = 1.0x, 1800 = 18%, 1000 = 10%. */
export const BP = 10_000;

/**
 * Apply a basis-point rate to an amount.
 *
 * Rounds half-up to the nearest paisa. Rounding has to happen *somewhere* and
 * doing it once per line — rather than letting a fraction ride into the next
 * multiplication — is what keeps a printed invoice's lines adding up to its own
 * total.
 */
export function applyBp(amountPaise: number, bp: number): number {
  return Math.round((amountPaise * bp) / BP);
}

/** Rupees (as typed by a human) to paise. Returns null if it isn't a number. */
export function toPaise(rupees: unknown): number | null {
  const n = typeof rupees === "string" ? Number(rupees.trim()) : Number(rupees);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function toRupees(paise: number): number {
  return paise / 100;
}

/**
 * Format for display, in Indian digit grouping (1,00,000 not 100,000).
 *
 * Whole rupees when the paise are zero, which they almost always are — an
 * invoice reading "₹6,000" is easier to check at a glance than "₹6,000.00".
 */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const hasPaise = paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(rupees);
}
