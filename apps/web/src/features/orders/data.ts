import "server-only";

import type { Address } from "@/features/orders/address";
import { pool } from "@/lib/db/index";

/**
 * Read models for the buyer, seller and Finance pages. Plain server functions
 * (not Server Actions): pages call them after their own access check, and every
 * query is scoped by the caller's id in SQL, so a guessed order number or id
 * returns nothing.
 */

export interface OrderItemView {
  id: string;
  artworkId: string | null;
  title: string;
  imageUrl: string | null;
  pricePaise: number;
}

export interface SellerOrderView {
  id: string;
  sellerId: string;
  sellerName: string;
  status: string;
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  refundedPaise: number;
  acceptBy: Date | null;
  courier: string | null;
  awb: string | null;
  trackingUrl: string | null;
  buyerConfirmedAt: Date | null;
  releaseEligibleAt: Date | null;
  items: OrderItemView[];
}

export interface BuyerOrderView {
  id: string;
  orderNumber: string;
  status: string;
  totalPaise: number;
  subtotalPaise: number;
  shippingPaise: number;
  createdAt: Date;
  expiresAt: Date;
  address: Address;
  sellerOrders: SellerOrderView[];
  events: { at: Date; toStatus: string; note: string | null; sellerOrderId: string | null }[];
}

async function itemsFor(sellerOrderIds: string[]): Promise<Map<string, OrderItemView[]>> {
  const map = new Map<string, OrderItemView[]>();
  if (sellerOrderIds.length === 0) return map;
  const { rows } = await pool.query<{ id: string; seller_order_id: string; artwork_id: string | null; title: string; image: string | null; price: number }>(
    `select id, seller_order_id, artwork_id, title_snapshot as title, image_snapshot as image, unit_price_paise as price
     from order_items where seller_order_id = any($1::text[]) order by created_at`,
    [sellerOrderIds]
  );
  for (const r of rows) {
    map.set(r.seller_order_id, [...(map.get(r.seller_order_id) ?? []), { id: r.id, artworkId: r.artwork_id, title: r.title, imageUrl: r.image, pricePaise: r.price }]);
  }
  return map;
}

export async function getBuyerOrders(buyerId: string) {
  const { rows } = await pool.query<{ id: string; order_number: string; status: string; total_paise: number; created_at: Date; sellers: number; titles: string[] }>(
    `select o.id, o.order_number, o.status, o.total_paise, o.created_at,
            (select count(*)::int from seller_orders so where so.order_id = o.id) as sellers,
            coalesce((select array_agg(i.title_snapshot order by i.created_at) from order_items i where i.order_id = o.id), '{}') as titles
     from orders o where o.buyer_id = $1 order by o.created_at desc limit 100`,
    [buyerId]
  );
  return rows.map((r) => ({ id: r.id, orderNumber: r.order_number, status: r.status, totalPaise: r.total_paise, createdAt: r.created_at, sellers: r.sellers, titles: r.titles }));
}

export async function getBuyerOrder(buyerId: string, orderNumber: string): Promise<BuyerOrderView | null> {
  const o = await pool.query<{
    id: string; order_number: string; status: string; total_paise: number; subtotal_paise: number; shipping_paise: number;
    created_at: Date; expires_at: Date; shipping_address: Address;
  }>(
    `select id, order_number, status, total_paise, subtotal_paise, shipping_paise, created_at, expires_at, shipping_address
     from orders where order_number = $1 and buyer_id = $2`,
    [orderNumber, buyerId]
  );
  const order = o.rows[0];
  if (!order) return null;
  const sos = await pool.query<{
    id: string; seller_id: string; seller_name: string | null; status: string; subtotal_paise: number; shipping_paise: number; total_paise: number;
    refunded_paise: number; accept_by: Date | null; courier: string | null; awb: string | null; tracking_url: string | null;
    buyer_confirmed_at: Date | null; release_eligible_at: Date | null;
  }>(
    `select so.id, so.seller_id, coalesce(p."displayName", 'Artist') as seller_name, so.status, so.subtotal_paise, so.shipping_paise,
            so.total_paise, so.refunded_paise, so.accept_by, so.courier, so.awb, so.tracking_url, so.buyer_confirmed_at, so.release_eligible_at
     from seller_orders so left join artist_profiles p on p."userId" = so.seller_id where so.order_id = $1 order by so.created_at`,
    [order.id]
  );
  const items = await itemsFor(sos.rows.map((s) => s.id));
  const ev = await pool.query<{ at: Date; to_status: string; note: string | null; seller_order_id: string | null }>(
    `select at, to_status, note, seller_order_id from order_events where order_id = $1 order by at, id`,
    [order.id]
  );
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    totalPaise: order.total_paise,
    subtotalPaise: order.subtotal_paise,
    shippingPaise: order.shipping_paise,
    createdAt: order.created_at,
    expiresAt: order.expires_at,
    address: order.shipping_address,
    sellerOrders: sos.rows.map((s) => ({
      id: s.id,
      sellerId: s.seller_id,
      sellerName: s.seller_name ?? "Artist",
      status: s.status,
      subtotalPaise: s.subtotal_paise,
      shippingPaise: s.shipping_paise,
      totalPaise: s.total_paise,
      refundedPaise: s.refunded_paise,
      acceptBy: s.accept_by,
      courier: s.courier,
      awb: s.awb,
      trackingUrl: s.tracking_url,
      buyerConfirmedAt: s.buyer_confirmed_at,
      releaseEligibleAt: s.release_eligible_at,
      items: items.get(s.id) ?? [],
    })),
    events: ev.rows.map((e) => ({ at: e.at, toStatus: e.to_status, note: e.note, sellerOrderId: e.seller_order_id })),
  };
}

export interface SellerInboxRow extends SellerOrderView {
  orderNumber: string;
  buyerName: string;
  /** Only present once the order is paid: an unpaid checkout never reveals the buyer's address. */
  address: Address | null;
  placedAt: Date;
  /** What the artist will receive if nothing is refunded (their net plus pass-through shipping). */
  youReceivePaise: number;
}

export async function getSellerOrders(sellerId: string): Promise<SellerInboxRow[]> {
  const { rows } = await pool.query<{
    id: string; order_number: string; status: string; subtotal_paise: number; shipping_paise: number; total_paise: number; refunded_paise: number;
    accept_by: Date | null; courier: string | null; awb: string | null; tracking_url: string | null; buyer_confirmed_at: Date | null;
    release_eligible_at: Date | null; seller_net_paise: number; created_at: Date; buyer_name: string | null; shipping_address: Address;
  }>(
    `select so.id, o.order_number, so.status, so.subtotal_paise, so.shipping_paise, so.total_paise, so.refunded_paise, so.accept_by,
            so.courier, so.awb, so.tracking_url, so.buyer_confirmed_at, so.release_eligible_at, so.seller_net_paise, so.created_at,
            u.name as buyer_name, o.shipping_address
     from seller_orders so join orders o on o.id = so.order_id left join "user" u on u.id = o.buyer_id
     where so.seller_id = $1 and so.status not in ('pending_payment', 'expired', 'cancelled')
     order by so.created_at desc limit 100`,
    [sellerId]
  );
  const items = await itemsFor(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    sellerId,
    sellerName: "",
    orderNumber: r.order_number,
    status: r.status,
    subtotalPaise: r.subtotal_paise,
    shippingPaise: r.shipping_paise,
    totalPaise: r.total_paise,
    refundedPaise: r.refunded_paise,
    acceptBy: r.accept_by,
    courier: r.courier,
    awb: r.awb,
    trackingUrl: r.tracking_url,
    buyerConfirmedAt: r.buyer_confirmed_at,
    releaseEligibleAt: r.release_eligible_at,
    items: items.get(r.id) ?? [],
    buyerName: r.buyer_name ?? "Buyer",
    address: r.shipping_address,
    placedAt: r.created_at,
    youReceivePaise: r.seller_net_paise + r.shipping_paise,
  }));
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  sellerName: string;
  totalPaise: number;
  refundedPaise: number;
  platformFeePaise: number;
  createdAt: Date;
  holdStatus: string | null;
}

export async function getAdminOverview() {
  const orders = await pool.query<{
    id: string; order_number: string; status: string; seller_name: string | null; total_paise: number; refunded_paise: number;
    platform_fee_paise: number; created_at: Date; hold_status: string | null;
  }>(
    `select so.id, o.order_number, so.status, p."displayName" as seller_name, so.total_paise, so.refunded_paise, so.platform_fee_paise,
            so.created_at, h.status as hold_status
     from seller_orders so join orders o on o.id = so.order_id
     left join artist_profiles p on p."userId" = so.seller_id
     left join escrow_holds h on h.seller_order_id = so.id
     order by so.created_at desc limit 100`
  );
  const payouts = await pool.query<{ id: string; payee_name: string | null; payee_kind: string; amount_paise: number; status: string; utr: string | null; verified: boolean; order_number: string }>(
    `select py.id, u.name as payee_name, py.payee_kind, py.amount_paise, py.status, py.utr, u.identity_verified as verified, o.order_number
     from payouts py join seller_orders so on so.id = py.seller_order_id join orders o on o.id = so.order_id
     left join "user" u on u.id = py.payee_user_id
     order by (py.status = 'owed') desc, py.created_at desc limit 100`
  );
  const totals = await pool.query<{ gmv: string; held: string; owed: string; stuck: number }>(
    `select coalesce((select sum(total_paise) from orders where status = 'paid'), 0)::text as gmv,
            coalesce((select sum(h.amount_paise - coalesce((select sum(r.amount_paise) from escrow_releases r where r.escrow_hold_id = h.id), 0))
                      from escrow_holds h where h.seller_order_id is not null and h.status = 'held'), 0)::text as held,
            coalesce((select sum(amount_paise) from payouts where status = 'owed'), 0)::text as owed,
            (select count(*)::int from order_refunds where status = 'failed' and attempts >= 3) as stuck`
  );
  return {
    orders: orders.rows.map<AdminOrderRow>((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      status: r.status,
      sellerName: r.seller_name ?? "Artist",
      totalPaise: r.total_paise,
      refundedPaise: r.refunded_paise,
      platformFeePaise: r.platform_fee_paise,
      createdAt: r.created_at,
      holdStatus: r.hold_status,
    })),
    payouts: payouts.rows.map((r) => ({
      id: r.id,
      payeeName: r.payee_name ?? "Payee",
      payeeKind: r.payee_kind,
      amountPaise: r.amount_paise,
      status: r.status,
      utr: r.utr,
      identityVerified: r.verified,
      orderNumber: r.order_number,
    })),
    totals: { gmvPaise: Number(totals.rows[0].gmv), heldPaise: Number(totals.rows[0].held), owedPaise: Number(totals.rows[0].owed), stuckRefunds: totals.rows[0].stuck },
  };
}
