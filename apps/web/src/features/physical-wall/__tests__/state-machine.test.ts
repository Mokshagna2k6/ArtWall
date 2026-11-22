import { describe, it, expect } from "vitest";
import {
  SLOT_STATES,
  SLOT_TRANSITIONS,
  SLOT_STATE_META,
  canTransition,
  requiresAdmin,
  assertTransition,
  isOccupied,
  isSlotState,
  IllegalTransitionError,
  ForbiddenTransitionError,
  type SlotState,
} from "../state-machine";

describe("SLOT_STATES", () => {
  it("has exactly 9 states", () => {
    expect(SLOT_STATES).toHaveLength(9);
  });

  it("includes the core lifecycle states", () => {
    const expected: SlotState[] = [
      "available",
      "reserved",
      "booked",
      "received",
      "installed",
      "live",
      "ended",
      "maintenance",
      "blocked",
    ];
    expect([...SLOT_STATES]).toEqual(expected);
  });
});

describe("isSlotState", () => {
  it("accepts valid states", () => {
    for (const state of SLOT_STATES) {
      expect(isSlotState(state)).toBe(true);
    }
  });

  it("rejects garbage", () => {
    expect(isSlotState("deleted")).toBe(false);
    expect(isSlotState("")).toBe(false);
    expect(isSlotState(null)).toBe(false);
    expect(isSlotState(42)).toBe(false);
  });
});

describe("isOccupied", () => {
  it("occupied states are reserved through live", () => {
    expect(isOccupied("reserved")).toBe(true);
    expect(isOccupied("booked")).toBe(true);
    expect(isOccupied("received")).toBe(true);
    expect(isOccupied("installed")).toBe(true);
    expect(isOccupied("live")).toBe(true);
  });

  it("non-occupied states", () => {
    expect(isOccupied("available")).toBe(false);
    expect(isOccupied("ended")).toBe(false);
    expect(isOccupied("maintenance")).toBe(false);
    expect(isOccupied("blocked")).toBe(false);
  });
});

describe("canTransition", () => {
  it("allows the happy path: available -> reserved -> booked -> received -> installed -> live -> ended -> available", () => {
    const path: SlotState[] = [
      "available",
      "reserved",
      "booked",
      "received",
      "installed",
      "live",
      "ended",
      "available",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("allows force-release: booked -> available", () => {
    expect(canTransition("booked", "available")).toBe(true);
  });

  it("forbids skipping: available -> live", () => {
    expect(canTransition("available", "live")).toBe(false);
  });

  it("forbids backward: live -> installed", () => {
    expect(canTransition("live", "installed")).toBe(false);
  });

  it("forbids self-transition on live", () => {
    expect(canTransition("live", "live")).toBe(false);
  });

  it("allows maintenance -> available", () => {
    expect(canTransition("maintenance", "available")).toBe(true);
  });

  it("allows maintenance -> blocked", () => {
    expect(canTransition("maintenance", "blocked")).toBe(true);
  });

  it("allows blocked -> available", () => {
    expect(canTransition("blocked", "available")).toBe(true);
  });

  it("every state has at least one outgoing transition", () => {
    for (const state of SLOT_STATES) {
      expect(SLOT_TRANSITIONS[state].length).toBeGreaterThan(0);
    }
  });
});

describe("requiresAdmin", () => {
  it("booked -> available is admin-only (force release)", () => {
    expect(requiresAdmin("booked", "available")).toBe(true);
  });

  it("live -> ended is admin-only", () => {
    expect(requiresAdmin("live", "ended")).toBe(true);
  });

  it("available -> reserved is NOT admin-only (artist books)", () => {
    expect(requiresAdmin("available", "reserved")).toBe(false);
  });

  it("reserved -> booked is NOT admin-only (payment settles)", () => {
    expect(requiresAdmin("reserved", "booked")).toBe(false);
  });

  it("maintenance states are admin-only", () => {
    expect(requiresAdmin("available", "maintenance")).toBe(true);
    expect(requiresAdmin("available", "blocked")).toBe(true);
    expect(requiresAdmin("maintenance", "available")).toBe(true);
    expect(requiresAdmin("blocked", "available")).toBe(true);
  });
});

describe("assertTransition", () => {
  it("passes for a valid non-admin transition", () => {
    expect(() =>
      assertTransition("available", "reserved", { isAdmin: false })
    ).not.toThrow();
  });

  it("passes for an admin-only transition when isAdmin", () => {
    expect(() =>
      assertTransition("booked", "available", { isAdmin: true })
    ).not.toThrow();
  });

  it("throws IllegalTransitionError for impossible moves", () => {
    expect(() =>
      assertTransition("available", "live", { isAdmin: true })
    ).toThrow(IllegalTransitionError);
  });

  it("throws ForbiddenTransitionError for admin-only moves by non-admin", () => {
    expect(() =>
      assertTransition("booked", "available", { isAdmin: false })
    ).toThrow(ForbiddenTransitionError);
  });

  it("IllegalTransitionError has status 409", () => {
    try {
      assertTransition("available", "live", { isAdmin: true });
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalTransitionError);
      expect((e as IllegalTransitionError).status).toBe(409);
    }
  });

  it("ForbiddenTransitionError has status 403", () => {
    try {
      assertTransition("live", "ended", { isAdmin: false });
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenTransitionError);
      expect((e as ForbiddenTransitionError).status).toBe(403);
    }
  });
});

describe("SLOT_STATE_META", () => {
  it("has metadata for every state", () => {
    for (const state of SLOT_STATES) {
      expect(SLOT_STATE_META[state]).toBeDefined();
      expect(SLOT_STATE_META[state].label).toBeTruthy();
      expect(["ok", "warn", "busy", "off"]).toContain(
        SLOT_STATE_META[state].tone
      );
    }
  });
});
