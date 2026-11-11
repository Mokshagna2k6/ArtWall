import { afterAll, describe, expect, it } from "vitest";

import { actAs, type TestUser } from "@/test/db-setup";
import {
  grantTestAdminRole,
  grantTestVenueRole,
  makeUser,
  makeVenue,
  purgeTestData,
  q,
} from "@/test/fixtures";
import {
  getActor,
  hasVenueRole,
  listOwnVenues,
  NotAuthorisedVenueRoleError,
  requireVenueRole,
} from "@/features/physical-wall/authorize";

/**
 * Bible §13/§35 + Locked Rules 34-35, migration 0081.
 *
 * The whole reason these roles are NOT on the global `admin_role_assignments`
 * axis is that a global grant over-grants: it would let a Wall Manager hired
 * by one venue act on every venue. That is what most of this file asserts —
 * per-venue isolation, no cross-role substitution (Rule 35), no platform-admin
 * bypass, and revocation taking effect immediately.
 */
afterAll(purgeTestData);

async function asActor(user: TestUser) {
  actAs(user);
  const actor = await getActor();
  if (!actor) throw new Error("getActor() returned null for a just-created fixture user");
  return actor;
}

describe("hasVenueRole — per-venue scoping (Bible §13)", () => {
  it("a Wall Manager granted on one venue has the role on that venue", async () => {
    const user = await makeUser("artist");
    const venue = await makeVenue();
    await grantTestVenueRole(user.id, venue, "wall_manager");

    expect(await hasVenueRole(await asActor(user), venue, "wall_manager")).toBe(true);
  });

  it("a Wall Manager has NO role on a venue they were not granted (the mis-grant 0081 exists to prevent)", async () => {
    const user = await makeUser("artist");
    const granted = await makeVenue();
    const other = await makeVenue();
    await grantTestVenueRole(user.id, granted, "wall_manager");
    const actor = await asActor(user);

    expect(await hasVenueRole(actor, granted, "wall_manager")).toBe(true);
    expect(await hasVenueRole(actor, other, "wall_manager")).toBe(false);
  });

  it("Rule 35: a Wall Consultant grant does not satisfy a Wall Manager check, or the reverse", async () => {
    const consultant = await makeUser("artist");
    const manager = await makeUser("artist");
    const venue = await makeVenue();
    await grantTestVenueRole(consultant.id, venue, "wall_consultant");
    await grantTestVenueRole(manager.id, venue, "wall_manager");

    const consultantActor = await asActor(consultant);
    expect(await hasVenueRole(consultantActor, venue, "wall_consultant")).toBe(true);
    expect(await hasVenueRole(consultantActor, venue, "wall_manager")).toBe(false);

    const managerActor = await asActor(manager);
    expect(await hasVenueRole(managerActor, venue, "wall_manager")).toBe(true);
    expect(await hasVenueRole(managerActor, venue, "wall_consultant")).toBe(false);
  });

  it("both roles can be held on the same venue by the same person, independently", async () => {
    const user = await makeUser("artist");
    const venue = await makeVenue();
    await grantTestVenueRole(user.id, venue, "wall_manager");
    await grantTestVenueRole(user.id, venue, "wall_consultant");
    const actor = await asActor(user);

    expect(await hasVenueRole(actor, venue, "wall_manager")).toBe(true);
    expect(await hasVenueRole(actor, venue, "wall_consultant")).toBe(true);
  });

  it("an ungranted user has neither role", async () => {
    const user = await makeUser("artist");
    const venue = await makeVenue();
    const actor = await asActor(user);

    expect(await hasVenueRole(actor, venue, "wall_manager")).toBe(false);
    expect(await hasVenueRole(actor, venue, "wall_consultant")).toBe(false);
  });

  it("a platform super_admin does NOT get a venue role by virtue of being an admin", async () => {
    const superAdmin = await makeUser("admin");
    await grantTestAdminRole(superAdmin.id, "super_admin");
    const venue = await makeVenue();

    expect(await hasVenueRole(await asActor(superAdmin), venue, "wall_manager")).toBe(false);
  });

  it("a venue_admin (Wall Network Admin) does NOT get a venue role either", async () => {
    const venueAdmin = await makeUser("admin");
    await grantTestAdminRole(venueAdmin.id, "venue_admin");
    const venue = await makeVenue();

    expect(await hasVenueRole(await asActor(venueAdmin), venue, "wall_manager")).toBe(false);
  });

  it("a revoked grant stops counting immediately", async () => {
    const user = await makeUser("artist");
    const venue = await makeVenue();
    await grantTestVenueRole(user.id, venue, "wall_manager");
    const actor = await asActor(user);
    expect(await hasVenueRole(actor, venue, "wall_manager")).toBe(true);

    await q(
      `update venue_role_assignments set revoked_at = now()
       where user_id = $1 and venue_id = $2 and revoked_at is null`,
      [user.id, venue]
    );
    expect(await hasVenueRole(actor, venue, "wall_manager")).toBe(false);
  });

  it("signed out, or an empty venue id, holds nothing", async () => {
    const user = await makeUser("artist");
    const venue = await makeVenue();
    await grantTestVenueRole(user.id, venue, "wall_manager");

    expect(await hasVenueRole(null, venue, "wall_manager")).toBe(false);
    expect(await hasVenueRole(await asActor(user), "", "wall_manager")).toBe(false);
  });
});

describe("listOwnVenues — multi-venue access (Rule 34)", () => {
  it("returns every venue the role is held on, and only those", async () => {
    const user = await makeUser("artist");
    const a = await makeVenue();
    const b = await makeVenue();
    await makeVenue(); // a third venue, deliberately not granted
    await grantTestVenueRole(user.id, a, "wall_manager");
    await grantTestVenueRole(user.id, b, "wall_manager");

    const held = await listOwnVenues(await asActor(user), "wall_manager");
    expect(held.sort()).toEqual([a, b].sort());
  });

  it("is scoped per role, not merged across them", async () => {
    const user = await makeUser("artist");
    const managed = await makeVenue();
    const advised = await makeVenue();
    await grantTestVenueRole(user.id, managed, "wall_manager");
    await grantTestVenueRole(user.id, advised, "wall_consultant");
    const actor = await asActor(user);

    expect(await listOwnVenues(actor, "wall_manager")).toEqual([managed]);
    expect(await listOwnVenues(actor, "wall_consultant")).toEqual([advised]);
  });

  it("excludes revoked grants, and is empty when signed out", async () => {
    const user = await makeUser("artist");
    const venue = await makeVenue();
    await grantTestVenueRole(user.id, venue, "wall_consultant");
    const actor = await asActor(user);
    expect(await listOwnVenues(actor, "wall_consultant")).toEqual([venue]);

    await q(`update venue_role_assignments set revoked_at = now() where user_id = $1`, [user.id]);
    expect(await listOwnVenues(actor, "wall_consultant")).toEqual([]);
    expect(await listOwnVenues(null, "wall_consultant")).toEqual([]);
  });
});

describe("requireVenueRole — the server-action gate (Bible rule 42)", () => {
  it("returns the actor when the role is held on that venue", async () => {
    const user = await makeUser("artist");
    const venue = await makeVenue();
    await grantTestVenueRole(user.id, venue, "wall_manager");
    actAs(user);

    const actor = await requireVenueRole(venue, "wall_manager");
    expect(actor.id).toBe(user.id);
  });

  it("throws a 403 for the wrong venue", async () => {
    const user = await makeUser("artist");
    const granted = await makeVenue();
    const other = await makeVenue();
    await grantTestVenueRole(user.id, granted, "wall_manager");
    actAs(user);

    await expect(requireVenueRole(other, "wall_manager")).rejects.toBeInstanceOf(
      NotAuthorisedVenueRoleError
    );
  });

  it("throws a 403 for the wrong role on the right venue (Rule 35)", async () => {
    const user = await makeUser("artist");
    const venue = await makeVenue();
    await grantTestVenueRole(user.id, venue, "wall_consultant");
    actAs(user);

    let thrown: unknown;
    try {
      await requireVenueRole(venue, "wall_manager");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(NotAuthorisedVenueRoleError);
    const error = thrown as NotAuthorisedVenueRoleError;
    expect(error.status).toBe(403);
    expect(error.message).toMatch(/Wall Manager/);
    expect(error.venueId).toBe(venue);
  });

  it("throws for a signed-out caller before any venue lookup", async () => {
    const venue = await makeVenue();
    actAs(null);

    await expect(requireVenueRole(venue, "wall_manager")).rejects.toThrow();
  });
});
