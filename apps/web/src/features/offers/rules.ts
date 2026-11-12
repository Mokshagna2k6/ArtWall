/**
 * The Bible's §17 Part 1 offer rules, as pure functions.
 *
 * Deliberately free of `server-only`, the database and the session: these are
 * the three rules that must never drift (the 50% floor, the 7/14/30 validity,
 * the 2-counter-round ceiling), so they live somewhere a unit test can reach
 * them directly rather than only through a database round trip. The database
 * enforces the same floor and ceiling as CHECK constraints (migration 0085) —
 * these are the first line, not the only one.
 */

/** §17: the only validity windows a buyer may choose. */
export const VALIDITY_DAYS = [7, 14, 30] as const;
export type ValidityDays = (typeof VALIDITY_DAYS)[number];

/** §17: an opening offer or counter may never be under half the asking price. */
export const MIN_OFFER_FRACTION = 0.5;

/** §17: after two counters the thread is done. Round 0 is the opening offer. */
export const MAX_COUNTER_ROUNDS = 2;

/**
 * The lowest acceptable offer, in paise.
 *
 * Rounded UP, so an odd asking price rounds against the buyer: at an ask of
 * 100001 paise the floor is 50001, not 50000. The same expression is the
 * `artwork_offers_min_half` CHECK, which uses Postgres integer division
 * `(asking + 1) / 2` — identical arithmetic for every positive integer.
 */
export function minimumOfferPaise(askingPricePaise: number): number {
  return Math.ceil(askingPricePaise / 2);
}

export function isValidOfferAmount(offerPaise: number, askingPricePaise: number): boolean {
  return (
    Number.isInteger(offerPaise) &&
    offerPaise > 0 &&
    askingPricePaise > 0 &&
    offerPaise >= minimumOfferPaise(askingPricePaise)
  );
}

/**
 * Which round a counter to `lastRound` would be, or null when the thread has
 * used both of its counters and must expire instead.
 */
export function nextCounterRound(lastRound: number): number | null {
  const next = lastRound + 1;
  return next > MAX_COUNTER_ROUNDS ? null : next;
}

/** When an offer made now, with this validity, stops being answerable. */
export function offerExpiry(validityDays: ValidityDays, from = new Date()): Date {
  return new Date(from.getTime() + validityDays * 24 * 60 * 60 * 1000);
}

/**
 * The public demand-supply signal for an artwork (§17, and §44 / rule 40).
 *
 * A range and a count, never a row. `low`/`high` collapse to the same number
 * when there is one offer, which is the deliberate cost of showing anything at
 * all for a single offer — it reveals an amount but still no identity, and the
 * Bible asks for the range explicitly. Nothing here can carry a buyer id,
 * because the type has no field for one.
 */
export interface DemandSignal {
  offerCount: number;
  lowPaise: number | null;
  highPaise: number | null;
  latestOfferAt: Date | null;
}

export const NO_DEMAND: DemandSignal = {
  offerCount: 0,
  lowPaise: null,
  highPaise: null,
  latestOfferAt: null,
};
