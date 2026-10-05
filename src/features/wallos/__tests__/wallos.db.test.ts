import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { actAs } from "@/test/db-setup";
import { makeBooking, makeSlots, makeUser, purgeTestData, q } from "@/test/fixtures";
import { db } from "@/lib/db/index";
import { walls, wallosSlots } from "@/lib/db/schema";
import {
  createWallosNode,
  createWallosSlot,
  deleteWallosNode,
  deleteWallosSlot,
  getSlotOrganization,
  listWallosNodes,
  updateWallosNode,
  updateWallosSlot,
} from "@/features/wallos/actions";
import { computeVenueRevenueShare, getActiveCommissionPolicy } from "@/features/policy/commission";
import type { Result } from "@/features/physical-wall/action-state";

/**
 * BE-3.13/BE-3.14: CRUD for the WallOS hierarchy, parent-child integrity,
 * the booking -> pw_slots -> slots -> ... -> organizations join, and the
 * venue revenue-share calculation.
 *
 * Rows created here get ids from newId() (org_..., venue_..., ...), not the
 * betest_ prefix purgeTestData() scans for, since these are brand-new
 * tables untouched by any existing cleanup path. Every test tracks its own
 * ids and deletes them (children first) in afterEach, so a crashed run still
 * leaves nothing behind beyond what a re-run safely overwrites.
 */

function data<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.data;
}
const errorOf = (r: Result<unknown>) => (r.ok ? null : r.error);

const created: { table: string; id: string }[] = [];
function track(table: string, id: string) {
  created.push({ table, id });
  return id;
}

afterEach(async () => {
  // Delete in reverse (child-first) order.
  for (const { table, id } of created.reverse()) {
    await q(`delete from ${table} where id = $1`, [id]);
  }
  created.length = 0;
  actAs(null);
});

afterEach(purgeTestData);

describe("WallOS hierarchy CRUD (BE-3.13)", () => {
  it("admin can create/read/update/delete a full org->venue->building->floor->zone->wall chain", async () => {
    const admin = await makeUser("admin");
    actAs(admin);

    const orgId = track("organizations", data(await createWallosNode("organization", { name: "Test Org" })));
    const venueId = track("venues", data(await createWallosNode("venue", { name: "Test Venue", parentId: orgId })));
    const bldgId = track("buildings", data(await createWallosNode("building", { name: "Test Building", parentId: venueId })));
    const floorId = track("floors", data(await createWallosNode("floor", { name: "Test Floor", parentId: bldgId })));
    const zoneId = track("rooms_zones", data(await createWallosNode("roomZone", { name: "Test Zone", parentId: floorId })));
    const wallId = track("walls", data(await createWallosNode("wall", { name: "Test Wall", parentId: zoneId })));

    const venueList = await listWallosNodes("venue", orgId);
    expect(venueList.map((v) => v.id)).toContain(venueId);

    data(await updateWallosNode("wall", wallId, "Renamed Wall"));
    const [wall] = await db.select().from(walls).where(eq(walls.id, wallId));
    expect(wall.name).toBe("Renamed Wall");

    // Deleting a venue that still has a building under it is rejected (DB FK, restrict).
    expect(errorOf(await deleteWallosNode("venue", venueId))).toMatch(/still has child rows/);

    // Bottom-up delete succeeds.
    data(await deleteWallosNode("wall", wallId));
    created.pop(); // wall already deleted
    data(await deleteWallosNode("roomZone", zoneId));
    created.pop();
    data(await deleteWallosNode("floor", floorId));
    created.pop();
    data(await deleteWallosNode("building", bldgId));
    created.pop();
    data(await deleteWallosNode("venue", venueId));
    created.pop();
    data(await deleteWallosNode("organization", orgId));
    created.pop();
  });

  it("rejects a venue with an invalid/non-existent organization id (parent-child integrity)", async () => {
    actAs(await makeUser("admin"));
    const result = await createWallosNode("venue", { name: "Orphan Venue", parentId: "org_does_not_exist" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/No organization with id/);
  });

  it("non-admin cannot create a node", async () => {
    actAs(await makeUser("artist"));
    const result = await createWallosNode("organization", { name: "Should Fail" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/admin access/);
  });

  it("creating a slot under a non-existent wall is rejected", async () => {
    actAs(await makeUser("admin"));
    const result = await createWallosSlot({ wallId: "wall_does_not_exist", label: "A1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/No wall with id/);
  });

  it("full chain + slot CRUD, including update and FK-guarded delete", async () => {
    actAs(await makeUser("admin"));
    const orgId = track("organizations", data(await createWallosNode("organization", { name: "Slot Org" })));
    const venueId = track("venues", data(await createWallosNode("venue", { name: "Slot Venue", parentId: orgId })));
    const bldgId = track("buildings", data(await createWallosNode("building", { name: "Slot Bldg", parentId: venueId })));
    const floorId = track("floors", data(await createWallosNode("floor", { name: "Slot Floor", parentId: bldgId })));
    const zoneId = track("rooms_zones", data(await createWallosNode("roomZone", { name: "Slot Zone", parentId: floorId })));
    const wallId = track("walls", data(await createWallosNode("wall", { name: "Slot Wall", parentId: zoneId })));

    const slotId = track("slots", data(await createWallosSlot({ wallId, label: "A1" })));
    data(await updateWallosSlot(slotId, "A1-renamed"));
    const [slot] = await db.select().from(wallosSlots).where(eq(wallosSlots.id, slotId));
    expect(slot.label).toBe("A1-renamed");
    expect(slot.onChainSlotId).toBeNull(); // BE-3.14: never force-populated for MVP.

    const org = await getSlotOrganization(slotId);
    expect(org?.organizationId).toBe(orgId);

    data(await deleteWallosSlot(slotId));
    created.pop();
  });
});

describe("Bookings reference a Slot within the WallOS hierarchy (BE-3.13)", () => {
  it("joins pw_bookings -> pw_booking_slots -> pw_slots -> slots (wallos_slot_id) -> walls -> ... -> organizations for a real booking", async () => {
    // makeSlots() creates a pw_slots row the normal (pre-0050) way; migration
    // 0050's backfill only ran once, at migration time, over rows that
    // existed then — no trigger keeps new pw_slots rows linked (confirmed:
    // the slots this test's own fixture, and even the seed script's slots,
    // come back with wallos_slot_id null). No application code links a new
    // pw_slots row to the hierarchy yet (that's FE-3.13's job), so this test
    // links one explicitly — proving the join itself resolves correctly
    // end-to-end for a real booking, which is BE-3.13's actual ask.
    const [slotId] = await makeSlots(1);
    const hierarchySlotId = track("slots", `wos_test_${slotId}`);
    await q(`insert into slots (id, wall_id, label, pw_slot_id) values ($1, 'wall_default', $2, $3)`, [
      hierarchySlotId,
      slotId,
      slotId,
    ]);
    await q(`update pw_slots set wallos_slot_id = $1 where id = $2`, [hierarchySlotId, slotId]);

    const artist = await makeUser("artist");
    const bookingId = await makeBooking(artist.id, [slotId], { status: "paid" });

    const rows = await q<{
      booking_id: string;
      pw_slot_id: string;
      wallos_slot_id: string;
      wall_id: string;
      organization_id: string;
      organization_name: string;
    }>(
      `select
         b.id as booking_id,
         ps.id as pw_slot_id,
         ps.wallos_slot_id,
         s.wall_id,
         o.id as organization_id,
         o.name as organization_name
       from pw_bookings b
       join pw_booking_slots bs on bs.booking_id = b.id
       join pw_slots ps on ps.id = bs.slot_id
       join slots s on s.id = ps.wallos_slot_id
       join walls w on w.id = s.wall_id
       join rooms_zones rz on rz.id = w.room_zone_id
       join floors f on f.id = rz.floor_id
       join buildings bl on bl.id = f.building_id
       join venues v on v.id = bl.venue_id
       join organizations o on o.id = v.organization_id
       where b.id = $1`,
      [bookingId]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].pw_slot_id).toBe(slotId);
    expect(rows[0].wallos_slot_id).toBe(hierarchySlotId);
    expect(rows[0].organization_id).toBe("org_default");
    expect(rows[0].organization_name).toBe("ArtWall");

    // Clean up the manual wallos_slot_id link before purgeTestData's
    // pw_slots delete runs (the `slots` row FKs to pw_slots via pw_slot_id,
    // but pw_slots -> slots is the restrict-on-delete direction that matters
    // here, so clear it explicitly rather than relying on ordering).
    await q(`update pw_slots set wallos_slot_id = null where id = $1`, [slotId]);
  });
});

describe("Venue revenue share (BE-3.14)", () => {
  it("computes the share amount from the active venue_revenue_share rate, in paise, round-half-up", async () => {
    const policy = await getActiveCommissionPolicy("venue_revenue_share");
    const result = await computeVenueRevenueShare("venue_default", 118_00); // 118.00 INR in paise

    expect(result.policyId).toBe(policy.id);
    expect(result.rateBps).toBe(policy.rateBps);
    // rate is seeded at 2000 bps (20%) by 0055; verify the actual math rather
    // than assuming the seed, in case an admin already changed the active row.
    const expected = Math.round((118_00 * policy.rateBps) / 10_000);
    expect(result.shareAmountPaise).toBe(expected);
  });

  it("scales linearly and handles zero", async () => {
    const a = await computeVenueRevenueShare("venue_default", 1_000_00);
    const b = await computeVenueRevenueShare("venue_default", 2_000_00);
    expect(b.shareAmountPaise).toBe(a.shareAmountPaise * 2);

    const zero = await computeVenueRevenueShare("venue_default", 0);
    expect(zero.shareAmountPaise).toBe(0);
  });

  it("rejects an empty venue id", async () => {
    await expect(computeVenueRevenueShare("", 1000)).rejects.toThrow(/Which venue/);
  });
});
