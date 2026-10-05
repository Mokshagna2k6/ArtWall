import { applyBp, assertPaise } from "@/features/physical-wall/money";

/**
 * Pure commission-split arithmetic for escrow releases (BE-3.11).
 *
 * Deliberately its own file with no database/auth imports — same reasoning
 * as money.ts: this is pure arithmetic, so it is testable (and callable)
 * without pulling in server-only plumbing. src/features/escrow/service.ts
 * does the actual capture/release/refund I/O and imports this.
 */

export interface CommissionSplitBps {
  platformBps: number;
  artistBps: number;
  curatorBps: number;
  venueBps: number;
}

/**
 * Split `amountPaise` across platform/artist/curator-venue per `split`'s bps,
 * rounding half-up per share (money.ts's applyBp) and folding any residual
 * paisa from rounding into the artist's share — the rounding is at most a
 * few paise and the artist is the party actually owed the remainder of the
 * sale price after platform/curator-venue take their cut, so this is the
 * natural place for it (never dropped, never invented).
 *
 * When `hasCuratorVenue` is false, the curator/venue bps folds into the
 * artist's share rather than vanishing — the money is still owed to someone,
 * and with no curator/venue on the transaction the artist is that someone.
 *
 * `royaltyBps` (commission_policy_versions' fifth share) is intentionally
 * excluded: it prices secondary-sale creator royalties (BE-3.02/
 * mint_commitments), a different transaction shape from "who gets paid out
 * of this escrowed purchase". Only platform + artist + curator/venue divide
 * an escrow release.
 */
export function computeEscrowSplit(
  amountPaise: number,
  split: CommissionSplitBps,
  hasCuratorVenue: boolean
): { platformPaise: number; artistPaise: number; curatorVenuePaise: number } {
  assertPaise(amountPaise);
  const curatorVenueBps = hasCuratorVenue ? split.curatorBps + split.venueBps : 0;

  const platformPaise = applyBp(amountPaise, split.platformBps);
  const curatorVenuePaise = applyBp(amountPaise, curatorVenueBps);
  // Artist takes the exact remainder, so the three paise amounts always sum
  // to amountPaise regardless of rounding on the other two shares.
  const artistPaise = amountPaise - platformPaise - curatorVenuePaise;

  return { platformPaise, artistPaise, curatorVenuePaise };
}
