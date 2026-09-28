/**
 * GST place-of-supply and tax split for wall-rental invoices.
 *
 * Intra-state supply (supplier state = place of supply): CGST + SGST, half
 * each. Inter-state: IGST, all of it. pw_invoices CHECKs enforce one regime.
 *
 * Place of supply, in order:
 *   1. recipient GSTIN (B2B) — its first two digits are the state code;
 *   2. a state the admin chose explicitly when generating the invoice;
 *   3. the artist's profile location, if it names a state/UT unambiguously;
 *   4. no location on record → the supplier's state (IGST Act s.12(2)(b)(ii)).
 * A location that is present but names no state is an error, not a guess.
 *
 * ponytail: CA to confirm. SAC 997212 is renting of non-residential property;
 * if the supply is "in relation to immovable property" (IGST Act s.12(3)), the
 * place of supply is the venue's state for every artist — i.e. always
 * CGST+SGST. If so, make resolvePlaceOfSupply return the supplier state.
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

const ALIASES: Record<string, string> = {
  "new delhi": "07",
  "nct of delhi": "07",
  orissa: "21",
  pondicherry: "34",
  "j&k": "01",
  "j and k": "01",
  uttaranchal: "05",
  "daman and diu": "26",
  "dadra and nagar haveli": "26",
  "andaman": "35",
};

const norm = (text: string) =>
  ` ${text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()} `;

/** A two-digit state code from free text, or null if it names none (or several). */
export function stateCodeFromText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const hay = norm(text);
  const found = new Set<string>();
  for (const [code, name] of Object.entries(GST_STATES)) if (hay.includes(norm(name))) found.add(code);
  for (const [alias, code] of Object.entries(ALIASES)) if (hay.includes(norm(alias))) found.add(code);
  // Whole-word matching; two different states named is ambiguous → null.
  return found.size === 1 ? [...found][0] : null;
}

export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  const m = gstin?.trim().toUpperCase().match(/^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/);
  return m && GST_STATES[m[1]] ? m[1] : null;
}

/** Supplier state: from our GSTIN when registered, else ARTWALL_GST_STATE_CODE (default Rajasthan). */
export function supplierStateCode(): string {
  return (
    stateCodeFromGstin(process.env.ARTWALL_GSTIN) ??
    (GST_STATES[process.env.ARTWALL_GST_STATE_CODE ?? ""] ? process.env.ARTWALL_GST_STATE_CODE! : "08")
  );
}

export class PlaceOfSupplyError extends Error {}

export function resolvePlaceOfSupply(input: {
  supplierState: string;
  customerGstin?: string | null;
  explicitState?: string | null;
  profileLocation?: string | null;
}): string {
  if (input.customerGstin) {
    const code = stateCodeFromGstin(input.customerGstin);
    if (!code) throw new PlaceOfSupplyError("That GSTIN is not valid.");
    return code;
  }
  if (input.explicitState) {
    const code = GST_STATES[input.explicitState] ? input.explicitState : stateCodeFromText(input.explicitState);
    if (!code) throw new PlaceOfSupplyError(`"${input.explicitState}" is not an Indian state or UT.`);
    return code;
  }
  if (!input.profileLocation?.trim()) return input.supplierState;
  const code = stateCodeFromText(input.profileLocation);
  if (!code) {
    throw new PlaceOfSupplyError(
      `Can't tell the artist's state from "${input.profileLocation}". Choose the place of supply.`
    );
  }
  return code;
}

export function splitGst(gstPaise: number, supplierState: string, placeOfSupply: string) {
  if (supplierState === placeOfSupply) {
    const cgst = Math.round(gstPaise / 2);
    return { cgstPaise: cgst, sgstPaise: gstPaise - cgst, igstPaise: 0, intraState: true };
  }
  return { cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise, intraState: false };
}
