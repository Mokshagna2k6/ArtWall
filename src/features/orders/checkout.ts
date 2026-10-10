import "server-only";

import type { PoolClient } from "pg";

import type { Address } from "@/features/orders/address";
import { classifyCartRow, ISSUE_MESSAGES } from "@/features/orders/cart-rules";
import { checkoutTotals, groupBySeller, type CartLine } from "@/features/orders/money";
import { getMarketplaceSettings, getOpenCommissionSplit } from "@/features/orders/settings";
import { recordOrderEvent, releaseArtworks, transitionSellerOrder } from "@/features/orders/transitions";
import { newId, PreconditionError } from "@/features/physical-wall/actions/shared";

/**
 * Turn a cart into a pending order: one parent `orders` row, one `seller_orders`
 * row per seller, an `order_items` row per work, and every work reserved. All
 * in the caller's transaction.
 *
 * Every price and fee here is read from the database (artworks.price_paise,
 * the open commission policy version, marketplace_settings); the only things
 * that come from the browser are the address and an idempotency key.
 */

export interface PendingOrder {
  orderId: string;
  orderNumber: string;
  totalPaise: number;
  providerOrderId: string | null;
  /** True when this call returned an order created by an earlier identical request. */
  reused: boolean;
  status: string;
}

export async function createPendingOrder(
  client: PoolClient,
  buyer: { id: string; email: string },
  address: Address,
  idempotencyKey: string
): Promise<PendingOrder> {
  // A double-click or a retry after a dropped response returns the same order.
  const existing = await client.query<{ id: string; order_number: string; total_paise: number; provider_order_id: string | null; status: string }>(
    `select id, order_number, total_paise, provider_order_id, status from orders where buyer_id = $1 and idempotency_key = $2`,
    [buyer.id, idempotencyKey]
  );
  if (existing.rows[0]) {
    const o = existing.rows[0];
    return { orderId: o.id, orderNumber: o.order_number, totalPaise: o.total_paise, providerOrderId: o.provider_order_id, reused: true, status: o.status };
  }

  // Free works held by checkouts nobody finished, so they are buyable again.
  await expireOverdueCheckouts(client);

  // Lock the artworks in a stable order: two overlapping carts cannot deadlock.
  const { rows } = await client.query<{
    artwork_id: string;
    curator_user_id: string | null;
    seller_id: string;
    title: string;
    image: string | null;
    status: string;
    is_public: boolean;
    seller_published: boolean | null;
    price: number | null;
  }>(
    `select c.artwork_id, c.curator_user_id, a."userId" as seller_id, a.title, a."imageUrl" as image, a.status,
            a."isPublic" as is_public, p.published as seller_published, a.price_paise as price
     from cart_items c
     join artworks a on a.id = c.artwork_id
     left join artist_profiles p on p."userId" = a."userId"
     where c.user_id = $1
     order by a.id
     for update of a`,
    [buyer.id]
  );
  if (rows.length === 0) throw new PreconditionError("Your cart is empty.");

  const problems = rows
    .map((r) => ({
      r,
      issue: classifyCartRow(
        {
          artworkId: r.artwork_id,
          artwork: { sellerId: r.seller_id, status: r.status, isPublic: r.is_public, sellerPublished: Boolean(r.seller_published), pricePaise: r.price },
        },
        buyer.id
      ),
    }))
    .filter((x) => x.issue);
  if (problems.length > 0) {
    throw new PreconditionError(
      `Some items can't be bought right now: ${problems.map((p) => `${p.r.title} (${ISSUE_MESSAGES[p.issue!]})`).join("; ")} Remove them from your cart to continue.`
    );
  }

  const settings = await getMarketplaceSettings(client);
  const policy = await getOpenCommissionSplit(client);
  const lines: CartLine[] = rows.map((r) => ({
    artworkId: r.artwork_id,
    sellerId: r.seller_id,
    unitPricePaise: r.price!,
    curatorUserId: r.curator_user_id,
  }));
  const groups = groupBySeller(lines, policy.split, settings.flatShippingPaise);
  const totals = checkoutTotals(groups);
  if (totals.totalPaise > settings.maxOrderPaise) {
    throw new PreconditionError("This order is above the maximum we can take online. Please contact us to buy these works.");
  }

  const orderId = newId("ord");
  const seq = await client.query<{ n: string }>(`select nextval('orders_number_seq')::text as n`);
  const orderNumber = `AW-${new Date().getFullYear()}-${seq.rows[0].n.padStart(6, "0")}`;
  const expiresAt = new Date(Date.now() + settings.checkoutHoldMinutes * 60_000);

  await client.query(
    `insert into orders (id, order_number, buyer_id, buyer_email, buyer_phone, status, subtotal_paise, shipping_paise, gst_paise,
                         total_paise, shipping_address, idempotency_key, expires_at)
     values ($1, $2, $3, $4, $5, 'pending_payment', $6, $7, 0, $8, $9, $10, $11)`,
    [orderId, orderNumber, buyer.id, buyer.email, address.phone, totals.subtotalPaise, totals.shippingPaise, totals.totalPaise, JSON.stringify(address), idempotencyKey, expiresAt]
  );
  await recordOrderEvent(client, { orderId, sellerOrderId: null, from: null, to: "pending_payment", actorId: buyer.id, note: "Checkout started" });

  const titles = new Map(rows.map((r) => [r.artwork_id, r]));
  for (const g of groups) {
    const soId = newId("sord");
    await client.query(
      `insert into seller_orders (id, order_id, seller_id, status, subtotal_paise, shipping_paise, total_paise,
                                  platform_fee_paise, curator_fee_paise, seller_net_paise, commission_policy_version_id)
       values ($1, $2, $3, 'pending_payment', $4, $5, $6, $7, $8, $9, $10)`,
      [soId, orderId, g.sellerId, g.subtotalPaise, g.shippingPaise, g.totalPaise, g.platformFeePaise, g.curatorFeePaise, g.sellerNetPaise, policy.id]
    );
    await recordOrderEvent(client, { orderId, sellerOrderId: soId, from: null, to: "pending_payment", actorId: buyer.id });
    for (const l of g.lines) {
      const src = titles.get(l.artworkId)!;
      await client.query(
        `insert into order_items (id, order_id, seller_order_id, artwork_id, seller_id, title_snapshot, image_snapshot, unit_price_paise,
                                  platform_fee_paise, curator_user_id, curator_fee_paise, seller_net_paise)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [newId("oit"), orderId, soId, l.artworkId, l.sellerId, src.title, src.image, l.unitPricePaise, l.platformFeePaise, l.curatorUserId, l.curatorFeePaise, l.sellerNetPaise]
      );
    }
  }

  // The oversell guard: only a work still `available` can be reserved. The
  // partial unique index on order_items(artwork_id) where active backs this up.
  const reserved = await client.query(
    `update artworks set status = 'reserved', "updatedAt" = now() where id = any($1::text[]) and status = 'available'`,
    [rows.map((r) => r.artwork_id)]
  );
  if (reserved.rowCount !== rows.length) {
    throw new PreconditionError("One of these works was just taken by another buyer. Review your cart and try again.");
  }

  return { orderId, orderNumber, totalPaise: totals.totalPaise, providerOrderId: null, reused: false, status: "pending_payment" };
}

/**
 * Release a pending (unpaid) order: its works go back on sale and every
 * sub-order is closed. `to` is `expired` for the sweep and `cancelled` when the
 * buyer backs out. Safe to call twice: only a still-pending order is touched.
 */
export async function releasePendingOrder(
  client: PoolClient,
  orderId: string,
  to: "expired" | "cancelled",
  actor: { kind: "system" | "buyer"; id: string | null }
): Promise<boolean> {
  const o = await client.query<{ status: string }>(`select status from orders where id = $1 for update`, [orderId]);
  if (o.rows[0]?.status !== "pending_payment") return false;
  const sos = await client.query<{ id: string }>(`select id from seller_orders where order_id = $1 order by id`, [orderId]);
  for (const so of sos.rows) {
    await transitionSellerOrder(client, so.id, to, { actor: actor.kind, actorId: actor.id, note: to === "expired" ? "Checkout hold expired" : "Buyer cancelled checkout" });
    await releaseArtworks(client, so.id);
  }
  await client.query(`update orders set status = $2, updated_at = now() where id = $1`, [orderId, to]);
  await recordOrderEvent(client, { orderId, sellerOrderId: null, from: "pending_payment", to, actorId: actor.id });
  return true;
}

/** Expire unpaid checkouts past their hold. Cheap, and run opportunistically before every new checkout. */
export async function expireOverdueCheckouts(client: PoolClient, limit = 50): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `select id from orders where status = 'pending_payment' and expires_at < now() order by expires_at limit $1 for update skip locked`,
    [limit]
  );
  let n = 0;
  for (const { id } of rows) if (await releasePendingOrder(client, id, "expired", { kind: "system", id: null })) n += 1;
  return n;
}
