/**
 * GST place of supply and tax split for wall-rental invoices.
 *
 * Decision (resolves the earlier "CA to confirm" note): a wall-slot booking is
 * the grant of a right to use part of a physical wall at the venue — SAC 997212,
 * renting of non-residential immovable property. IGST Act s.12(3)(a) fixes the
 * place of supply of any service "by way of grant of rights to use immovable
 * property" as the location of that property, and s.12(3) overrides the
 * recipient-based rules in s.12(2) for everyone, registered or not. So the
 * artist's GSTIN or home state never moves the place of supply: it is always
 * the venue's state. We must be GST-registered in the state the venue is in,
 * so supplier state == venue state and every wall-rental invoice is intra-state
 * CGST + SGST. A B2B artist still claims ITC — their GSTIN is printed on the
 * invoice, it just does not change the tax regime.
 *
 * Add-ons (install, lighting) are ancillary to the rental and invoiced as one
 * composite supply with it, so they follow the same place of supply.
 *
 * splitGst stays general (IGST when the states differ) because pw_invoices
 * supports both regimes; if a supply NOT tied to the venue is ever invoiced
 * (e.g. an online-only service), its place of supply comes from s.12(2), not
 * from venuePlaceOfSupply.
 */

export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

export class GstinError extends Error {}

/** State code of a well-formed GSTIN, or null. */
export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  const m = gstin?.trim().toUpperCase().match(/^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/);
  return m && GST_STATES[m[1]] ? m[1] : null;
}

/**
 * Supplier state = the venue's state. From our GSTIN when registered, else
 * ARTWALL_GST_STATE_CODE, else Rajasthan (08, where the first wall is).
 */
export function supplierStateCode(): string {
  const fromEnv = process.env.ARTWALL_GST_STATE_CODE ?? "";
  return stateCodeFromGstin(process.env.ARTWALL_GSTIN) ?? (GST_STATES[fromEnv] ? fromEnv : "08");
}

/** Place of supply for a wall rental: the venue (s.12(3)(a)), whoever the customer is. */
export function venuePlaceOfSupply(): string {
  return supplierStateCode();
}

/** Validate an optional customer GSTIN; returns it normalised, or null. */
export function normaliseCustomerGstin(gstin: string | null | undefined): string | null {
  const trimmed = gstin?.trim().toUpperCase();
  if (!trimmed) return null;
  if (!stateCodeFromGstin(trimmed)) throw new GstinError("That GSTIN is not valid.");
  return trimmed;
}

/** Indian financial year (April–March) of a YYYY-MM-DD date, e.g. "2026-27". */
export function fiscalYear(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const year = m >= 4 ? y : y - 1;
  return `${year}-${String(year + 1).slice(2)}`;
}

/** "AW/2026-27/0042". */
export function formatInvoiceNumber(fy: string, n: number): string {
  return `AW/${fy}/${String(n).padStart(4, "0")}`;
}

/**
 * Every amount printed on an invoice, from the booking's two stored integers.
 * Integer paise in, integer paise out; lines always add up to the total.
 */
export function invoiceAmounts(totalPaise: number, gstPaise: number, supplierState: string, placeOfSupply: string) {
  if (!Number.isSafeInteger(totalPaise) || !Number.isSafeInteger(gstPaise) || gstPaise < 0 || gstPaise > totalPaise) {
    throw new Error(`Inconsistent invoice amounts: total ${totalPaise}, GST ${gstPaise}`);
  }
  return { netPaise: totalPaise - gstPaise, totalPaise, ...splitGst(gstPaise, supplierState, placeOfSupply) };
}

export function splitGst(gstPaise: number, supplierState: string, placeOfSupply: string) {
  if (!Number.isSafeInteger(gstPaise)) throw new Error(`GST must be integer paise, got ${gstPaise}`);
  if (supplierState === placeOfSupply) {
    const cgst = Math.round(gstPaise / 2);
    return { cgstPaise: cgst, sgstPaise: gstPaise - cgst, igstPaise: 0, intraState: true };
  }
  return { cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise, intraState: false };
}
