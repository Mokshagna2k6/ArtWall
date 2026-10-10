import "server-only";

import type { PoolClient } from "pg";

import { splitRelease } from "@/features/orders/money";
import { transitionSellerOrder, lockSellerOrder } from "@/features/orders/transitions";
import { newId, PreconditionError } from "@/features/physical-wall/actions/shared";

/**
 * Escrow for seller sub-orders (BE-3.11 / BE-3.12), on the existing
 * escrow_holds / escrow_releases tables (0049, 0057, 0067).
 *
 * Same double-entry convention as src/features/escrow/service.ts (which is
 * booking-shaped and left untouched): revenue rows are +amount, expense rows
 * -amount, and every capture / release / refund writes rows that sum to zero.
 *
 *   capture : -hold (escrow_hold)            +hold (escrow_hold)
 *   release : -remaining (escrow_hold)       +platform +artist +curator(s) = remaining
 *   refund  : -amount (escrow_hold)          +amount (escrow_refund)
 *
 * One hold per sub-order, for the sub-order total (items + shipping), because
 * the buyer's money is escrowed whole and the platform's commission is only
 * recognised at release. Sellers are paid per sub-order, so another seller's
 * refund never touches this hold.
 */

interface LedgerEntry {
  type: "revenue" | "expense";
  category: string;
  amountPaise: number;
  note: string;
  sourceRef: string;
}

async function writeLedger(client: PoolClient, rows: LedgerEntry[], policyVersionId: string, createdBy: string | null): Promise<string[]> {
  const ids: string[] = [];
  for (const r of rows) {
    const id = newId("led");
    await client.query(
      `insert into pw_ledger (id, type, category, amount_paise, note, entry_date, source_ref, created_by, commission_policy_version_id)
       values ($1, $2, $3, $4, $5, current_date, $6, $7, $8)`,
      [id, r.type, r.category, r.amountPaise, r.note, r.sourceRef, createdBy, policyVersionId]
    );
    ids.push(id);
  }
  return ids;
}

/** Capture a sub-order's money into escrow. Called inside the settle transaction. */
export async function captureSellerOrderEscrow(
  client: PoolClient,
  so: { id: string; total_paise: number; commission_policy_version_id: string },
  disputeWindowDays: number
): Promise<string> {
  const holdId = newId("esc");
  await client.query(
    `insert into escrow_holds (id, seller_order_id, amount_paise, reason, status, dispute_window_days, release_eligible_at, commission_policy_version_id)
     values ($1, $2, $3, $4, 'held', greatest($5::integer, 1), null, $6)`,
    [holdId, so.id, so.total_paise, `Marketplace order ${so.id}`, disputeWindowDays, so.commission_policy_version_id]
  );
  await writeLedger(
    client,
    [
      { type: "expense", category: "escrow_hold", amountPaise: so.total_paise, note: `Escrow captured for order ${so.id}`, sourceRef: `escrow:${holdId}:capture:out` },
      { type: "revenue", category: "escrow_hold", amountPaise: so.total_paise, note: `Escrow captured for order ${so.id}`, sourceRef: `escrow:${holdId}:capture:in` },
    ],
    so.commission_policy_version_id,
    null
  );
  return holdId;
}

interface HoldRow {
  id: string;
  amount_paise: number;
  status: string;
}

async function lockHold(client: PoolClient, sellerOrderId: string): Promise<HoldRow & { released: number }> {
  const { rows } = await client.query<HoldRow>(
    `select id, amount_paise, status from escrow_holds where seller_order_id = $1 for update`,
    [sellerOrderId]
  );
  const hold = rows[0];
  if (!hold) throw new PreconditionError("This order has no escrow hold.");
  const { rows: sum } = await client.query<{ s: string }>(
    `select coalesce(sum(amount_paise), 0)::text as s from escrow_releases where escrow_hold_id = $1`,
    [hold.id]
  );
  return { ...hold, amount_paise: Number(hold.amount_paise), released: Number(sum[0].s) };
}

/**
 * Take a refund out of the hold (the money is going back to the buyer, not to
 * the seller). Within the caller's transaction, alongside queueing the
 * Razorpay refund, so a refund the buyer is owed can never be released to the
 * seller by a concurrent sweep.
 */
export async function refundFromEscrow(
  client: PoolClient,
  sellerOrderId: string,
  amountPaise: number,
  reason: string,
  policyVersionId: string,
  actorId: string | null
): Promise<void> {
  const hold = await lockHold(client, sellerOrderId);
  if (hold.status !== "held") throw new PreconditionError(`That order's escrow is already ${hold.status}.`);
  if (amountPaise > hold.amount_paise - hold.released) throw new PreconditionError("That is more than is held for this order.");
  const refId = `escrow:${hold.id}:refund:${newId("r")}`;
  const [, inId] = await writeLedger(
    client,
    [
      { type: "expense", category: "escrow_hold", amountPaise, note: `Escrow ${hold.id} refunded: ${reason}`, sourceRef: `${refId}:out` },
      { type: "revenue", category: "escrow_refund", amountPaise, note: `Escrow ${hold.id} refunded: ${reason}`, sourceRef: `${refId}:in` },
    ],
    policyVersionId,
    actorId
  );
  await client.query(
    `insert into escrow_releases (id, escrow_hold_id, ledger_id, amount_paise, released_to) values ($1, $2, $3, $4, 'refund')`,
    [newId("escr"), hold.id, inId, amountPaise]
  );
  if (hold.released + amountPaise === hold.amount_paise) {
    await client.query(`update escrow_holds set status = 'refunded' where id = $1`, [hold.id]);
  }
}

export type ReleaseOutcome = "released" | "not-yet" | "not-eligible";

/**
 * Release a delivered sub-order's escrow: platform commission, curator fee(s)
 * and the artist's share, and create the payout rows Finance will pay.
 *
 * Eligible only when the buyer confirmed receipt, or the dispute window after
 * courier-confirmed delivery has passed (the Bible's "delivery confirmation or
 * the dispute window"). Idempotent under the sub-order row lock: a second
 * call finds it `completed` and does nothing.
 */
export async function releaseSellerOrderEscrow(
  client: PoolClient,
  sellerOrderId: string,
  actor: { kind: "system" | "admin"; id: string | null }
): Promise<ReleaseOutcome> {
  const so = await lockSellerOrder(client, sellerOrderId);
  if (so.status !== "delivered") return "not-eligible";
  const confirmed = so.buyer_confirmed_at !== null;
  const windowPassed = so.release_eligible_at !== null && so.release_eligible_at <= new Date();
  if (!confirmed && !windowPassed) return "not-yet";

  const hold = await lockHold(client, sellerOrderId);
  if (hold.status !== "held") return "not-eligible";
  const remaining = hold.amount_paise - hold.released;

  const { rows: items } = await client.query<{ curator_user_id: string | null; fee: string }>(
    `select curator_user_id, sum(curator_fee_paise)::text as fee from order_items
     where seller_order_id = $1 and curator_user_id is not null and curator_fee_paise > 0 group by curator_user_id`,
    [sellerOrderId]
  );
  const curatorTotals = Object.fromEntries(items.map((r) => [r.curator_user_id!, Number(r.fee)]));
  const split = splitRelease({
    remainingPaise: remaining,
    holdPaise: hold.amount_paise,
    platformTotalPaise: so.platform_fee_paise,
    curatorTotals,
  });

  const ref = `escrow:${hold.id}:release`;
  const entries: LedgerEntry[] = [
    { type: "expense" as const, category: "escrow_hold", amountPaise: remaining, note: `Escrow ${hold.id} released`, sourceRef: `${ref}:out` },
    { type: "revenue" as const, category: "escrow_release_platform", amountPaise: split.platformPaise, note: `Escrow ${hold.id} to platform`, sourceRef: `${ref}:platform` },
    { type: "revenue" as const, category: "escrow_release_artist", amountPaise: split.artistPaise, note: `Escrow ${hold.id} to artist ${so.seller_id}`, sourceRef: `${ref}:artist` },
    ...Object.entries(split.curators).map(([id, amountPaise]) => ({
      type: "revenue" as const,
      category: "escrow_release_curator_venue",
      amountPaise,
      note: `Escrow ${hold.id} to curator ${id}`,
      sourceRef: `${ref}:curator:${id}`,
    })),
  ].filter((e) => e.amountPaise > 0);
  const ids = await writeLedger(client, entries, so.commission_policy_version_id, actor.id);

  // Every revenue row (ids[1..]) becomes an escrow_releases row; the expense row (ids[0]) is the hold closing.
  const recipients = entries.slice(1).map((e, i) => ({
    to: e.category === "escrow_release_platform" ? "platform" : e.category === "escrow_release_artist" ? so.seller_id : e.sourceRef.split(":curator:")[1],
    amountPaise: e.amountPaise,
    ledgerId: ids[i + 1],
    kind: e.category,
  }));
  for (const r of recipients) {
    const releaseId = newId("escr");
    await client.query(
      `insert into escrow_releases (id, escrow_hold_id, ledger_id, amount_paise, released_to) values ($1, $2, $3, $4, $5)`,
      [releaseId, hold.id, r.ledgerId, r.amountPaise, r.to]
    );
    if (r.kind !== "escrow_release_platform") {
      await client.query(
        `insert into payouts (id, seller_order_id, payee_user_id, payee_kind, amount_paise)
         values ($1, $2, $3, $4, $5)
         on conflict (seller_order_id, payee_kind, payee_user_id) do nothing`,
        [newId("pyo"), sellerOrderId, r.to, r.kind === "escrow_release_artist" ? "artist" : "curator", r.amountPaise]
      );
    }
  }
  await client.query(`update escrow_holds set status = 'released' where id = $1`, [hold.id]);
  await transitionSellerOrder(client, sellerOrderId, "completed", {
    actor: actor.kind,
    actorId: actor.id,
    note: "Escrow released",
    set: { completed_at: new Date() },
  });
  return "released";
}
