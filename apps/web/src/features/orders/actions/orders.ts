"use server";

import { z } from "zod";

import { requireBuyer, requireFinance, requireSeller } from "@/features/orders/authorize";
import {
  acceptSellerOrder,
  confirmReceipt,
  markSellerOrderDelivered,
  refundSellerOrder,
  shipSellerOrder,
} from "@/features/orders/fulfilment";
import { attempt, inTransaction, parseInput, PreconditionError, type Result } from "@/features/physical-wall/actions/shared";
import { recordAuditIn } from "@/features/physical-wall/audit";

/**
 * Buyer, seller and Finance actions on a seller sub-order. Each is scoped to
 * one sub-order: acting on one seller's part of a checkout never touches the
 * others. Ownership is checked inside the transaction (fulfilment.ts), not
 * here, so a forged id cannot reach another person's order.
 */

const sellerOrderId = z.string({ error: "Which order?" }).trim().min(1, "Which order?").max(64);
const target = z.object({ sellerOrderId });

// ── buyer ──────────────────────────────────────────────────────────────────

/** Free cancellation, until the artist accepts (plan Q17). Refunds this seller's part only. */
export async function cancelOrder(raw: unknown): Promise<Result<null>> {
  return attempt("cancelOrder", async () => {
    const input = parseInput(target, raw);
    const buyer = await requireBuyer();
    await refundSellerOrder({
      sellerOrderId: input.sellerOrderId,
      reason: "Cancelled by the buyer before the artist accepted.",
      kind: "buyer_cancel",
      actor: "buyer",
      actorId: buyer.id,
      mustBeBuyer: buyer.id,
    });
    return null;
  });
}

/** "It arrived": releases this seller's payment from escrow. */
export async function confirmDelivery(raw: unknown): Promise<Result<null>> {
  return attempt("confirmDelivery", async () => {
    const input = parseInput(target, raw);
    const buyer = await requireBuyer();
    await confirmReceipt(input.sellerOrderId, buyer.id);
    return null;
  });
}

// ── seller ─────────────────────────────────────────────────────────────────

export async function acceptOrder(raw: unknown): Promise<Result<null>> {
  return attempt("acceptOrder", async () => {
    const input = parseInput(target, raw);
    const seller = await requireSeller();
    await acceptSellerOrder(input.sellerOrderId, seller.id);
    return null;
  });
}

const declineInput = target.extend({ reason: z.string().trim().max(300).optional() });

export async function declineOrder(raw: unknown): Promise<Result<null>> {
  return attempt("declineOrder", async () => {
    const input = parseInput(declineInput, raw);
    const seller = await requireSeller();
    await refundSellerOrder({
      sellerOrderId: input.sellerOrderId,
      reason: input.reason ? `Declined by the artist: ${input.reason}` : "Declined by the artist.",
      kind: "seller_declined",
      actor: "seller",
      actorId: seller.id,
      mustBeSeller: seller.id,
    });
    return null;
  });
}

const shipInput = target.extend({
  courier: z.string({ error: "Enter the courier." }).trim().min(2, "Enter the courier.").max(60),
  awb: z.string({ error: "Enter the tracking number (AWB)." }).trim().min(3, "Enter the tracking number (AWB).").max(60),
  trackingUrl: z.string().trim().url("Enter a valid tracking link, or leave it empty.").max(300).optional().or(z.literal("")),
});

/** Manual dispatch: courier name + AWB entered by the artist. (Live Shiprocket booking is deferred.) */
export async function markShipped(raw: unknown): Promise<Result<null>> {
  return attempt("markShipped", async () => {
    const input = parseInput(shipInput, raw);
    const seller = await requireSeller();
    await shipSellerOrder({
      sellerOrderId: input.sellerOrderId,
      sellerId: seller.id,
      courier: input.courier,
      awb: input.awb,
      trackingUrl: input.trackingUrl || null,
      actor: "seller",
      actorId: seller.id,
    });
    return null;
  });
}

// ── Finance / admin ────────────────────────────────────────────────────────

export async function adminMarkDelivered(raw: unknown): Promise<Result<null>> {
  return attempt("adminMarkDelivered", async () => {
    const input = parseInput(target, raw);
    const admin = await requireFinance();
    await markSellerOrderDelivered(input.sellerOrderId, admin.id);
    await inTransaction((client) =>
      recordAuditIn(client, { actor: admin, action: "order.delivered", subjectType: "seller_order", subjectId: input.sellerOrderId })
    );
    return null;
  });
}

const adminRefundInput = target.extend({
  /** Omit for a full refund. Whole paise. */
  amountPaise: z.number({ error: "Enter the amount." }).int("Amounts are whole paise.").positive("Enter an amount above zero.").optional(),
  reason: z.string({ error: "Give a reason. This is audited." }).trim().min(3, "Give a reason. This is audited.").max(300),
});

/** Refund all or part of ONE seller's part of a checkout. Partial refunds shrink what escrow later releases. */
export async function adminRefundOrder(raw: unknown): Promise<Result<{ full: boolean }>> {
  return attempt("adminRefundOrder", async () => {
    const input = parseInput(adminRefundInput, raw);
    const admin = await requireFinance();
    const r = await refundSellerOrder({
      sellerOrderId: input.sellerOrderId,
      amountPaise: input.amountPaise,
      reason: input.reason,
      kind: "admin",
      actor: "admin",
      actorId: admin.id,
    });
    await inTransaction((client) =>
      recordAuditIn(client, {
        actor: admin,
        action: "order.refunded",
        subjectType: "seller_order",
        subjectId: input.sellerOrderId,
        after: { refundId: r.refundId, amountPaise: input.amountPaise ?? "full", reason: input.reason },
      })
    );
    return { full: r.full };
  });
}

const payoutInput = z.object({
  payoutId: z.string({ error: "Which payout?" }).trim().min(1).max(64),
  utr: z.string({ error: "Enter the bank reference (UTR)." }).trim().min(6, "Enter the bank reference (UTR).").max(40),
});

/**
 * Finance records that an owed payout was paid out of band (manual batch), with
 * the bank's UTR. Refused until the payee's identity is verified: the
 * documented payout gate (`user.identity_verified`).
 */
export async function markPayoutPaid(raw: unknown): Promise<Result<null>> {
  return attempt("markPayoutPaid", async () => {
    const input = parseInput(payoutInput, raw);
    const admin = await requireFinance();
    await inTransaction(async (client) => {
      const p = await client.query<{ payee_user_id: string; status: string; amount_paise: number }>(
        `select payee_user_id, status, amount_paise from payouts where id = $1 for update`,
        [input.payoutId]
      );
      const payout = p.rows[0];
      if (!payout) throw new PreconditionError("We couldn't find that payout.");
      if (payout.status !== "owed") throw new PreconditionError(`That payout is already ${payout.status}.`);
      const idv = await client.query<{ identity_verified: boolean }>(`select identity_verified from "user" where id = $1`, [payout.payee_user_id]);
      if (!idv.rows[0]?.identity_verified) throw new PreconditionError("The payee's identity is not verified yet, so they cannot be paid.");
      await client.query(`update payouts set status = 'paid', utr = $2, approved_by = $3, paid_at = now(), updated_at = now() where id = $1`, [
        input.payoutId,
        input.utr,
        admin.id,
      ]);
      await recordAuditIn(client, {
        actor: admin,
        action: "payout.paid",
        subjectType: "payout",
        subjectId: input.payoutId,
        after: { utr: input.utr, amountPaise: payout.amount_paise },
      });
    });
    return null;
  });
}
