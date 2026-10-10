import { computeEscrowSplit, type CommissionSplitBps } from "@/features/escrow/split";
import { assertPaise } from "@/features/physical-wall/money";

/**
 * Checkout money math. Pure: integer paise in, integer paise out, no I/O.
 *
 * Prices and commission come from the database / the open commission policy
 * version on the server; nothing here (or anywhere in checkout) reads an
 * amount from the client. The per-work split reuses `computeEscrowSplit`
 * (BE-3.11), so a checkout is priced by exactly the arithmetic the escrow
 * release later uses: platform and curator shares round half-up, the artist
 * takes the exact remainder, and the three always sum to the price.
 */

export interface CartLine {
  artworkId: string;
  sellerId: string;
  unitPricePaise: number;
  /** Set when the work was added from a curator's collection: that curator earns the curator share. */
  curatorUserId: string | null;
}

export interface PricedLine extends CartLine {
  platformFeePaise: number;
  curatorFeePaise: number;
  sellerNetPaise: number;
}

export interface SellerGroup {
  sellerId: string;
  lines: PricedLine[];
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  platformFeePaise: number;
  curatorFeePaise: number;
  sellerNetPaise: number;
}

export function priceLine(line: CartLine, split: CommissionSplitBps): PricedLine {
  assertPaise(line.unitPricePaise);
  if (line.unitPricePaise <= 0) throw new RangeError("A line must have a positive price.");
  const { platformPaise, artistPaise, curatorVenuePaise } = computeEscrowSplit(
    line.unitPricePaise,
    split,
    Boolean(line.curatorUserId)
  );
  return { ...line, platformFeePaise: platformPaise, curatorFeePaise: curatorVenuePaise, sellerNetPaise: artistPaise };
}

/** One sub-order per seller; shipping is charged once per seller (one parcel run), not per work. */
export function groupBySeller(lines: CartLine[], split: CommissionSplitBps, shippingPerSellerPaise: number): SellerGroup[] {
  assertPaise(shippingPerSellerPaise);
  const bySeller = new Map<string, PricedLine[]>();
  for (const line of lines) {
    const priced = priceLine(line, split);
    bySeller.set(line.sellerId, [...(bySeller.get(line.sellerId) ?? []), priced]);
  }
  return [...bySeller.entries()].map(([sellerId, priced]) => {
    const sum = (pick: (l: PricedLine) => number) => priced.reduce((acc, l) => acc + pick(l), 0);
    const subtotalPaise = sum((l) => l.unitPricePaise);
    return {
      sellerId,
      lines: priced,
      subtotalPaise,
      shippingPaise: shippingPerSellerPaise,
      totalPaise: subtotalPaise + shippingPerSellerPaise,
      platformFeePaise: sum((l) => l.platformFeePaise),
      curatorFeePaise: sum((l) => l.curatorFeePaise),
      sellerNetPaise: sum((l) => l.sellerNetPaise),
    };
  });
}

export function checkoutTotals(groups: SellerGroup[]) {
  const subtotalPaise = groups.reduce((a, g) => a + g.subtotalPaise, 0);
  const shippingPaise = groups.reduce((a, g) => a + g.shippingPaise, 0);
  return { subtotalPaise, shippingPaise, gstPaise: 0, totalPaise: subtotalPaise + shippingPaise };
}

/** floor((2·a·n + d) / 2d): round-half-up of a·n/d with no float. */
export function ratioRound(amountPaise: number, numerator: number, denominator: number): number {
  assertPaise(amountPaise);
  assertPaise(numerator);
  assertPaise(denominator);
  if (denominator <= 0) throw new RangeError("Denominator must be positive.");
  return Number((2n * BigInt(amountPaise) * BigInt(numerator) + BigInt(denominator)) / (2n * BigInt(denominator)));
}

export interface ReleaseInput {
  /** What is still held (hold amount minus refunds already taken out of it). */
  remainingPaise: number;
  /** The hold as first captured (= the sub-order total, shipping included). */
  holdPaise: number;
  platformTotalPaise: number;
  /** Snapshot curator fees by curator user id. */
  curatorTotals: Record<string, number>;
}

export interface ReleaseSplit {
  platformPaise: number;
  curators: Record<string, number>;
  /** Artist share: the exact remainder, including the pass-through shipping. */
  artistPaise: number;
}

/**
 * Split what is left in escrow between platform, curators and the artist.
 *
 * After a partial refund the platform and curator fees are reversed pro-rata
 * (fee x remaining/hold, half-up) and the artist takes the exact remainder, so
 * the parts always sum to `remainingPaise`. With no refund, remaining == hold
 * and this reproduces the checkout snapshot exactly.
 */
export function splitRelease(input: ReleaseInput): ReleaseSplit {
  const { remainingPaise, holdPaise } = input;
  if (remainingPaise < 0 || remainingPaise > holdPaise) throw new RangeError("Remaining must be within the hold.");
  const platformPaise = ratioRound(input.platformTotalPaise, remainingPaise, holdPaise);
  const curators: Record<string, number> = {};
  let curatorSum = 0;
  for (const [id, total] of Object.entries(input.curatorTotals)) {
    const share = ratioRound(total, remainingPaise, holdPaise);
    curators[id] = share;
    curatorSum += share;
  }
  const artistPaise = remainingPaise - platformPaise - curatorSum;
  if (artistPaise < 0) throw new RangeError("Fees exceed what is held.");
  return { platformPaise, curators, artistPaise };
}

/** How much of a sub-order can still be refunded. */
export function refundableRemaining(totalPaise: number, refundedPaise: number): number {
  return Math.max(0, totalPaise - refundedPaise);
}
