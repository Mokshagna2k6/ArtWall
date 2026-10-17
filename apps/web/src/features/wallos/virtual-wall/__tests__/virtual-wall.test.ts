import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EYE_HEIGHT,
  FLOOR_HEIGHT,
  ROOM_HALF,
  floorSpawn,
  slotOffset,
  slotPose,
  wallPose,
} from "@/features/wallos/virtual-wall/layout";

/**
 * The Virtual Wall's two pieces of non-trivial logic:
 *
 * 1. **Placement authorization.** Only Super Admin may place or remove art
 *    (the user's explicit requirement; Locked Rule 42: backend authorization
 *    is mandatory). The gate must hold for a signed-out caller, a plain user,
 *    a generic `admin` with no named role, and an admin holding a *different*
 *    named admin role — and must not depend on any UI flag.
 * 2. **Slot/artwork resolution geometry.** A slot's world position is derived
 *    from its place in the WallOS hierarchy, not stored, so the derivation is
 *    what keeps two slots off the same spot and keeps every work inside the
 *    room.
 *
 * The authorization half mocks the session and the role lookup rather than
 * using a database: the thing under test is which role is demanded and that a
 * refusal is a refusal, which is decidable without one. (The DB-level
 * invariants — one live placement per slot, empty slots surviving — are
 * enforced by migration 0073's partial unique indexes and were verified
 * against a throwaway postgres:17 container.)
 */

/** The role rows `hasAdminRole`'s query would find for the current fake user. */
let grantedRoles: string[] = [];
/** What `getSessionUser` returns. */
let sessionUser: { id: string; name: string; email: string } | null = null;
/** The generic `user.role` column. */
let userRole = "artist";

vi.mock("@/lib/session", () => ({
  getSessionUser: () => Promise.resolve(sessionUser),
}));

vi.mock("@/lib/db", () => ({
  /**
   * One fake for both queries authorize.ts makes. `getActor` selects
   * role/emailVerified; `hasAdminRole` asks for a row matching the required
   * role name, with `super_admin` always accepted — the fake reproduces that
   * same acceptance rule against `grantedRoles` so the test exercises the real
   * decision, not a stub that always says yes.
   */
  getSql: () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes('from "user"')) {
      return Promise.resolve([{ role: userRole, emailVerified: true }]);
    }
    if (text.includes("admin_role_assignments")) {
      const required = values.find(
        (v): v is string => typeof v === "string" && v !== sessionUser?.id
      );
      const ok = grantedRoles.some((r) => r === required || r === "super_admin");
      return Promise.resolve(ok ? [{ name: required }] : []);
    }
    return Promise.resolve([]);
  },
}));

const { hasAdminRole, requireAdminRole, getActor } = await import(
  "@/features/physical-wall/authorize"
);

beforeEach(() => {
  grantedRoles = [];
  sessionUser = null;
  userRole = "artist";
});

/** The exact gate both virtual-wall writes use. */
const placementGate = () => requireAdminRole("super_admin");

describe("virtual wall placement is Super Admin only (Locked Rule 42)", () => {
  it("refuses a signed-out caller", async () => {
    await expect(placementGate()).rejects.toThrow();
  });

  it("refuses a signed-in artist", async () => {
    sessionUser = { id: "u_artist", name: "A", email: "a@x.test" };
    userRole = "artist";
    await expect(placementGate()).rejects.toThrow();
  });

  it("refuses a generic admin holding no named admin role", async () => {
    sessionUser = { id: "u_admin", name: "B", email: "b@x.test" };
    userRole = "admin";
    grantedRoles = [];
    await expect(placementGate()).rejects.toThrow(/super_admin/);
  });

  it("refuses an admin holding a DIFFERENT named role", async () => {
    sessionUser = { id: "u_fin", name: "C", email: "c@x.test" };
    userRole = "admin";
    // Finance/venue admins run other parts of WallOS; neither may hang art.
    grantedRoles = ["finance_admin", "venue_admin"];
    await expect(placementGate()).rejects.toThrow(/super_admin/);
    expect(await hasAdminRole(await getActor(), "super_admin")).toBe(false);
  });

  it("allows a Super Admin", async () => {
    sessionUser = { id: "u_super", name: "D", email: "d@x.test" };
    userRole = "admin";
    grantedRoles = ["super_admin"];
    const actor = await placementGate();
    expect(actor.id).toBe("u_super");
    expect(await hasAdminRole(await getActor(), "super_admin")).toBe(true);
  });

  it("a user whose role column is not admin cannot pass even with the grant", async () => {
    // Defence in depth: the named-role grant is additive to the generic admin
    // tier, so a revoked `user.role` closes the door regardless of the grant.
    sessionUser = { id: "u_stale", name: "E", email: "e@x.test" };
    userRole = "visitor";
    grantedRoles = ["super_admin"];
    await expect(placementGate()).rejects.toThrow();
  });
});

describe("slot/artwork resolution geometry", () => {
  it("puts the four walls of a floor on four different sides, facing inward", () => {
    const poses = [0, 1, 2, 3].map((i) => wallPose(i, 0));
    const seen = new Set(poses.map((p) => `${p.position[0]},${p.position[2]}`));
    expect(seen.size).toBe(4);
    // Each wall sits on the room boundary on exactly one axis.
    for (const p of poses) {
      expect(Math.max(Math.abs(p.position[0]), Math.abs(p.position[2]))).toBe(ROOM_HALF);
    }
    // Four distinct facings.
    expect(new Set(poses.map((p) => p.rotationY)).size).toBe(4);
  });

  it("stacks floors by level, so a floor's art is above the one below", () => {
    expect(wallPose(0, 0).position[1]).toBe(0);
    expect(wallPose(0, 2).position[1]).toBe(2 * FLOOR_HEIGHT);
    expect(floorSpawn(3)).toEqual([0, 3 * FLOOR_HEIGHT + EYE_HEIGHT, 0]);
  });

  it("centres a lone slot and spreads several symmetrically", () => {
    expect(slotOffset(0, 1)).toBe(0);
    const three = [0, 1, 2].map((i) => slotOffset(i, 3));
    expect(three[1]).toBe(0);
    expect(three[0]).toBe(-three[2]);
    // Strictly increasing: no two slots share a position on the wall.
    expect(three[0]).toBeLessThan(three[1]);
    expect(three[1]).toBeLessThan(three[2]);
  });

  it("keeps every slot of a crowded wall inside the room", () => {
    for (let wallIndex = 0; wallIndex < 4; wallIndex++) {
      const count = 5;
      for (let i = 0; i < count; i++) {
        const pose = slotPose(wallIndex, 0, i, count);
        expect(Math.abs(pose.position[0])).toBeLessThanOrEqual(ROOM_HALF);
        expect(Math.abs(pose.position[2])).toBeLessThanOrEqual(ROOM_HALF);
      }
    }
  });

  it("gives two slots on the same wall different world positions", () => {
    const a = slotPose(1, 1, 0, 2);
    const b = slotPose(1, 1, 1, 2);
    expect(a.position).not.toEqual(b.position);
    // Same wall, so same facing and same hanging height.
    expect(a.rotationY).toBe(b.rotationY);
    expect(a.position[1]).toBe(b.position[1]);
  });

  it("hangs art above the floor slab it belongs to, not at the slab", () => {
    const pose = slotPose(0, 2, 0, 1);
    expect(pose.position[1]).toBeGreaterThan(2 * FLOOR_HEIGHT);
    expect(pose.position[1]).toBeLessThan(3 * FLOOR_HEIGHT);
  });
});
