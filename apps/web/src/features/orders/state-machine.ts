/**
 * Seller sub-order state machine. Pure: no database, no session.
 *
 * Every real write goes through `assertTransition` (see transitions.ts), so an
 * illegal move is a thrown error, not a silently accepted write. Same shape as
 * src/features/physical-wall/state-machine.ts. Payment lives on the parent
 * order (pending_payment | paid | expired | cancelled); everything a
 * seller or buyer does afterwards lives here, per seller.
 *
 * Disputes (`disputed`) are not modelled yet: the escrow release can be
 * stopped by an admin refund while a sub-order is shipped/delivered, which is
 * the v1 stand-in.
 */

export const SELLER_ORDER_STATES = [
  "pending_payment",
  "expired",
  "cancelled",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "completed",
  "refund_pending",
  "refunded",
] as const;
export type SellerOrderStatus = (typeof SELLER_ORDER_STATES)[number];

export type TransitionActor = "buyer" | "seller" | "admin" | "system";

/** from -> to -> who may make that move. */
export const SELLER_ORDER_TRANSITIONS: Record<SellerOrderStatus, Partial<Record<SellerOrderStatus, readonly TransitionActor[]>>> = {
  pending_payment: {
    paid: ["system"],
    expired: ["system"],
    cancelled: ["buyer", "system"],
  },
  expired: {},
  cancelled: {},
  paid: {
    processing: ["seller"],
    // Seller declines, buyer cancels before acceptance (Q17), 48h timeout, or admin.
    refund_pending: ["seller", "buyer", "system", "admin"],
  },
  processing: {
    shipped: ["seller", "admin"],
    refund_pending: ["admin"],
  },
  shipped: {
    delivered: ["buyer", "admin"],
    refund_pending: ["admin"],
  },
  delivered: {
    completed: ["system", "admin"],
    refund_pending: ["admin"],
  },
  // After release the money has left escrow; clawback is Finance work, not a state move.
  completed: {},
  refund_pending: { refunded: ["system", "admin"] },
  refunded: {},
};

export class IllegalOrderTransitionError extends Error {
  readonly status = 409;
  constructor(readonly from: string, readonly to: string, readonly actor: TransitionActor) {
    super(`An order cannot move from ${from} to ${to} that way.`);
    this.name = "IllegalOrderTransitionError";
  }
}

export function canTransition(from: SellerOrderStatus, to: SellerOrderStatus, actor: TransitionActor): boolean {
  return SELLER_ORDER_TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}

export function assertTransition(from: string, to: string, actor: TransitionActor): void {
  if (!canTransition(from as SellerOrderStatus, to as SellerOrderStatus, actor)) {
    throw new IllegalOrderTransitionError(from, to, actor);
  }
}

/** States in which the artwork is still held by the order (reserved or sold to this buyer). */
export const HOLDING_STATES: readonly SellerOrderStatus[] = [
  "pending_payment", "paid", "processing", "shipped", "delivered", "completed", "refund_pending",
];

/** States where money has been captured and not yet returned or released. */
export const FUNDS_HELD_STATES: readonly SellerOrderStatus[] = ["paid", "processing", "shipped", "delivered", "refund_pending"];
