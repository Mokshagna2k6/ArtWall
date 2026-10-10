import "server-only";

import { pool } from "@/lib/db/index";
import { curatorPicks } from "@/lib/db/schema";
import { db } from "@/lib/db/index";
import { eq } from "drizzle-orm";

import { computeEscrowSplit } from "@/features/escrow/split";

/**
 * FE-3.14: read-only escrow-split preview for display (e.g. a checkout UI's
 * "here's how your payment splits" breakdown). No marketplace purchase flow
 * exists yet to call this at actual checkout time (see escrow/service.ts's
 * header comment) — this loader lets a real page show the real, correct
 * split for an artwork's listed price today, computed the same way
 * captureEscrow/releaseEscrow will compute it once a purchase flow calls
 * them. It never writes anything; it is the preview half of the same
 * computeEscrowSplit arithmetic, not a new pricing rule.
 */
export interface EscrowSplitPreview {
  amountPaise: number;
  platformPaise: number;
  artistPaise: number;
  curatorVenuePaise: number;
  hasCuratorVenue: boolean;
  commissionPolicyVersion: number;
}

/**
 * The currently-open (effective_to is null) commission split, same query
 * shape as escrow/service.ts's getOpenCommissionSplit but read-only (no
 * transaction/row lock needed for a preview).
 */
async function getOpenCommissionSplit(): Promise<{
  version: number;
  platformBps: number;
  artistBps: number;
  curatorBps: number;
  venueBps: number;
} | null> {
  const { rows } = await pool.query<{
    version: number;
    platform_bps: number;
    artist_bps: number;
    curator_bps: number;
    venue_bps: number;
  }>(
    `select version, platform_bps, artist_bps, curator_bps, venue_bps
     from commission_policy_versions where effective_to is null limit 1`
  );
  const row = rows[0];
  if (!row) return null;
  return {
    version: row.version,
    platformBps: row.platform_bps,
    artistBps: row.artist_bps,
    curatorBps: row.curator_bps,
    venueBps: row.venue_bps,
  };
}

/**
 * Computes the escrow split for `amountPaise` against the artwork's active
 * commission policy version, folding curator/venue's share into the artist
 * when the artwork has no curator_picks row (the same hasCuratorVenue
 * convention releaseEscrow uses, derived here from whether this artwork was
 * ever curator-picked — the closest real signal available pre-checkout).
 * Returns null when there is no active policy or no price to split.
 */
export async function loadEscrowSplitPreview(
  artworkId: string,
  amountPaise: number | null | undefined
): Promise<EscrowSplitPreview | null> {
  if (amountPaise == null || amountPaise <= 0) return null;

  const [split, pickRows] = await Promise.all([
    getOpenCommissionSplit(),
    db.select({ id: curatorPicks.id }).from(curatorPicks).where(eq(curatorPicks.artworkId, artworkId)).limit(1),
  ]);
  if (!split) return null;

  const hasCuratorVenue = pickRows.length > 0;
  const { platformPaise, artistPaise, curatorVenuePaise } = computeEscrowSplit(
    amountPaise,
    { platformBps: split.platformBps, artistBps: split.artistBps, curatorBps: split.curatorBps, venueBps: split.venueBps },
    hasCuratorVenue
  );

  return {
    amountPaise,
    platformPaise,
    artistPaise,
    curatorVenuePaise,
    hasCuratorVenue,
    commissionPolicyVersion: split.version,
  };
}
