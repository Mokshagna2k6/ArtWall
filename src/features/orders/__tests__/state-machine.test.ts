import { describe, expect, it } from "vitest";

import {
  assertTransition,
  canTransition,
  FUNDS_HELD_STATES,
  IllegalOrderTransitionError,
  SELLER_ORDER_STATES,
  SELLER_ORDER_TRANSITIONS,
  type TransitionActor,
} from "@/features/orders/state-machine";

const ACTORS: TransitionActor[] = ["buyer", "seller", "admin", "system"];

describe("seller order state machine", () => {
  it("walks the happy path with the right actors", () => {
    expect(canTransition("pending_payment", "paid", "system")).toBe(true);
    expect(canTransition("paid", "processing", "seller")).toBe(true);
    expect(canTransition("processing", "shipped", "seller")).toBe(true);
    expect(canTransition("shipped", "delivered", "buyer")).toBe(true);
    expect(canTransition("delivered", "completed", "system")).toBe(true);
  });

  it("only the system confirms payment; a buyer or seller cannot mark an order paid", () => {
    for (const actor of ["buyer", "seller", "admin"] as const) {
      expect(canTransition("pending_payment", "paid", actor)).toBe(false);
    }
  });

  it("only the seller accepts", () => {
    expect(canTransition("paid", "processing", "buyer")).toBe(false);
    expect(canTransition("paid", "processing", "admin")).toBe(false);
  });

  it("a buyer can cancel only before acceptance", () => {
    expect(canTransition("paid", "refund_pending", "buyer")).toBe(true);
    for (const from of ["processing", "shipped", "delivered"] as const) {
      expect(canTransition(from, "refund_pending", "buyer")).toBe(false);
      expect(canTransition(from, "refund_pending", "admin")).toBe(true);
    }
  });

  it("a completed (released) order cannot be refunded by a state move", () => {
    for (const actor of ACTORS) expect(canTransition("completed", "refund_pending", actor)).toBe(false);
  });

  it("terminal states have no exits", () => {
    for (const s of ["expired", "cancelled", "completed", "refunded"] as const) {
      expect(Object.keys(SELLER_ORDER_TRANSITIONS[s])).toEqual([]);
    }
  });

  it("every transition target is a known state, and every state has an entry", () => {
    for (const s of SELLER_ORDER_STATES) {
      expect(SELLER_ORDER_TRANSITIONS[s]).toBeDefined();
      for (const to of Object.keys(SELLER_ORDER_TRANSITIONS[s])) expect(SELLER_ORDER_STATES).toContain(to);
    }
  });

  it("assertTransition throws a typed error for an illegal move", () => {
    expect(() => assertTransition("shipped", "paid", "system")).toThrow(IllegalOrderTransitionError);
    expect(() => assertTransition("paid", "processing", "seller")).not.toThrow();
  });

  it("money is held only in the states where it has been captured and not released or returned", () => {
    expect(FUNDS_HELD_STATES).toContain("paid");
    expect(FUNDS_HELD_STATES).not.toContain("completed");
    expect(FUNDS_HELD_STATES).not.toContain("refunded");
    expect(FUNDS_HELD_STATES).not.toContain("pending_payment");
  });
});
