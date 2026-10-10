import "server-only";

import type { PoolClient } from "pg";

import { PreconditionError } from "@/features/physical-wall/actions/shared";
import type { CommissionSplitBps } from "@/features/escrow/split";
import { pool } from "@/lib/db/index";

export interface MarketplaceSettings {
  checkoutHoldMinutes: number;
  sellerAcceptHours: number;
  disputeWindowDays: number;
  flatShippingPaise: number;
  maxOrderPaise: number;
}

type Queryable = Pick<PoolClient, "query"> | typeof pool;

export async function getMarketplaceSettings(db: Queryable = pool): Promise<MarketplaceSettings> {
  const { rows } = await db.query<{
    checkout_hold_minutes: number;
    seller_accept_hours: number;
    dispute_window_days: number;
    flat_shipping_paise: number;
    max_order_paise: number;
  }>(`select checkout_hold_minutes, seller_accept_hours, dispute_window_days, flat_shipping_paise, max_order_paise
      from marketplace_settings where id = 1`);
  const r = rows[0];
  if (!r) throw new PreconditionError("Marketplace settings are missing.");
  return {
    checkoutHoldMinutes: r.checkout_hold_minutes,
    sellerAcceptHours: r.seller_accept_hours,
    disputeWindowDays: r.dispute_window_days,
    flatShippingPaise: r.flat_shipping_paise,
    maxOrderPaise: r.max_order_paise,
  };
}

/**
 * The open commission policy version (BE-3.11: the split a purchase is priced
 * by). Same row the escrow service and the artwork page's split preview read.
 */
export async function getOpenCommissionSplit(db: Queryable = pool): Promise<{ id: string; split: CommissionSplitBps }> {
  const { rows } = await db.query<{
    id: string;
    platform_bps: number;
    artist_bps: number;
    curator_bps: number;
    venue_bps: number;
  }>(`select id, platform_bps, artist_bps, curator_bps, venue_bps from commission_policy_versions where effective_to is null limit 1`);
  const r = rows[0];
  if (!r) throw new PreconditionError("Checkout is not configured yet: no active commission policy.");
  return {
    id: r.id,
    split: { platformBps: r.platform_bps, artistBps: r.artist_bps, curatorBps: r.curator_bps, venueBps: r.venue_bps },
  };
}
