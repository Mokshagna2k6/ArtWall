import "server-only";

import type { PoolClient } from "pg";

import { PreconditionError } from "@/features/physical-wall/actions/shared";
import { assertTransition, type SellerOrderStatus, type TransitionActor } from "@/features/orders/state-machine";

/**
 * The one place a sub-order's status changes. Takes the row lock, checks the
 * state machine, updates, and writes the order_events row, all in the caller's
 * transaction, so a status and its audit trail cannot disagree.
 */

/** Columns a transition may set alongside the status. A whitelist: the keys are interpolated into SQL. */
const SETTABLE = [
  "accept_by", "release_eligible_at", "courier", "awb", "tracking_url", "cancel_reason",
  "paid_at", "accepted_at", "shipped_at", "delivered_at", "buyer_confirmed_at", "completed_at", "cancelled_at",
] as const;
export type SettableColumn = (typeof SETTABLE)[number];

export interface SellerOrderRow {
  id: string;
  order_id: string;
  seller_id: string;
  status: SellerOrderStatus;
  subtotal_paise: number;
  shipping_paise: number;
  total_paise: number;
  platform_fee_paise: number;
  curator_fee_paise: number;
  seller_net_paise: number;
  commission_policy_version_id: string;
  refunded_paise: number;
  accept_by: Date | null;
  release_eligible_at: Date | null;
  buyer_confirmed_at: Date | null;
  delivered_at: Date | null;
}

/** Lock and read a sub-order. Throws if it does not exist. */
export async function lockSellerOrder(client: PoolClient, sellerOrderId: string): Promise<SellerOrderRow> {
  const { rows } = await client.query<SellerOrderRow>(`select * from seller_orders where id = $1 for update`, [sellerOrderId]);
  if (!rows[0]) throw new PreconditionError("We couldn't find that order.");
  return rows[0];
}

export async function recordOrderEvent(
  client: PoolClient,
  e: { orderId: string; sellerOrderId: string | null; from: string | null; to: string; actorId: string | null; note?: string | null }
): Promise<void> {
  await client.query(
    `insert into order_events (order_id, seller_order_id, from_status, to_status, actor_id, note) values ($1, $2, $3, $4, $5, $6)`,
    [e.orderId, e.sellerOrderId, e.from, e.to, e.actorId, e.note ?? null]
  );
}

export async function transitionSellerOrder(
  client: PoolClient,
  sellerOrderId: string,
  to: SellerOrderStatus,
  opts: { actor: TransitionActor; actorId: string | null; note?: string; set?: Partial<Record<SettableColumn, unknown>> }
): Promise<SellerOrderRow> {
  const row = await lockSellerOrder(client, sellerOrderId);
  assertTransition(row.status, to, opts.actor);

  const sets = Object.entries(opts.set ?? {});
  for (const [col] of sets) {
    if (!(SETTABLE as readonly string[]).includes(col)) throw new Error(`Not a settable column: ${col}`);
  }
  const assignments = sets.map(([col], i) => `${col} = $${i + 3}`);
  await client.query(
    `update seller_orders set status = $2${assignments.length ? ", " + assignments.join(", ") : ""}, updated_at = now() where id = $1`,
    [sellerOrderId, to, ...sets.map(([, v]) => v)]
  );
  await recordOrderEvent(client, {
    orderId: row.order_id,
    sellerOrderId,
    from: row.status,
    to,
    actorId: opts.actorId,
    note: opts.note,
  });
  return { ...row, status: to };
}

/** Free this sub-order's artworks: the reservation (or a sale that is being unwound) goes back on the market. */
export async function releaseArtworks(client: PoolClient, sellerOrderId: string): Promise<void> {
  await client.query(
    `update artworks set status = 'available', "updatedAt" = now()
     where id in (select artwork_id from order_items where seller_order_id = $1 and active and artwork_id is not null)
       and status in ('reserved', 'sold')`,
    [sellerOrderId]
  );
  await client.query(`update order_items set active = false where seller_order_id = $1`, [sellerOrderId]);
}
