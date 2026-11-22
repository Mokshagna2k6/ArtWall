import { afterEach, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import {
  grantTestAdminRole,
  grantTestVenueRole,
  makeUser,
  makeVenue,
  purgeTestData,
  q,
  tid,
} from "@/test/fixtures";
import {
  listManagedVenues,
  listVenueWalls,
  listWallCities,
  saveSlotPricing,
  saveVenueDetails,
  saveWallDetails,
  searchWalls,
  setVenueListed,
} from "@/features/wallos/wall-manager/actions";
import {
  canPlaceVirtualArt,
  placeArtworkOnSlot,
  removeArtworkFromSlot,
} from "@/features/wallos/virtual-wall/actions";
import type { Result } from "@/features/physical-wall/action-state";

/**
 * Wall Manager (migration 0086 + features/wallos/wall-manager).
 *
 * The property these tests exist for is the cross-venue one: a `wall_manager`
 * grant on venue A must not authorize a single write to anything inside venue
 * B. That is the whole reason the actions re-derive a row's venue instead of
 * trusting the id they were handed, so it is tested at every level (venue,
 * wall, slot) rather than once.
 */

const errorOf = (r: Result<unknown>) => (r.ok ? null : r.error);

/** A venue with one building/floor/room, one wall and `slots` slots. */
async function makeVenueWithWall(slots = 2) {
  const venueId = await makeVenue();
  const buildingId = tid("bldg");
  const floorId = tid("floor");
  const zoneId = tid("zone");
  const wallId = tid("wall");

  await q(`insert into buildings (id, venue_id, name) values ($1,$2,'B')`, [buildingId, venueId]);
  await q(`insert into floors (id, building_id, name, level) values ($1,$2,'G',0)`, [floorId, buildingId]);
  await q(`insert into rooms_zones (id, floor_id, name) values ($1,$2,'Room')`, [zoneId, floorId]);
  await q(`insert into walls (id, room_zone_id, name) values ($1,$2,'Wall')`, [wallId, zoneId]);

  const slotIds: string[] = [];
  for (let i = 0; i < slots; i += 1) {
    const slotId = tid("slot");
    await q(`insert into slots (id, wall_id, label) values ($1,$2,$3)`, [slotId, wallId, `A${i + 1}`]);
    slotIds.push(slotId);
  }
  return { venueId, wallId, slotIds };
}

/**
 * The hierarchy rows here get `betest_` ids from tid(), which purgeTestData
 * already scans for — but it does not know about these WallOS tables, so each
 * run deletes its own, children first (every FK is `on delete restrict`).
 */
afterEach(async () => {
  const like = "betest\\_%";
  await q(`delete from virtual_wall_placements where slot_id like $1`, [like]);
  await q(`delete from artworks where id like $1`, [like]);
  await q(`delete from slots where id like $1`, [like]);
  await q(`delete from walls where id like $1`, [like]);
  await q(`delete from rooms_zones where id like $1`, [like]);
  await q(`delete from floors where id like $1`, [like]);
  await q(`delete from buildings where id like $1`, [like]);
  await q(`delete from venue_role_assignments where id like $1`, [like]);
  await q(`delete from venues where id like $1`, [like]);
  await q(`delete from organizations where id like $1`, [like]);
  await purgeTestData();
  actAs(null);
});

describe("Wall Manager — venue scope", () => {
  it("a wall_manager may edit the venue they are granted", async () => {
    const { venueId } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_manager");
    actAs(user);

    const result = await saveVenueDetails({
      venueId,
      venueType: "cafe",
      city: "Bengaluru",
      addressLine: "100 Feet Road",
      pincode: "560038",
    });
    expect(errorOf(result)).toBeNull();

    const rows = await q<{ city: string; venue_type: string }>(
      `select city, venue_type from venues where id = $1`,
      [venueId]
    );
    expect(rows[0]).toMatchObject({ city: "Bengaluru", venue_type: "cafe" });
  });

  it("a wall_manager on venue A cannot edit venue B", async () => {
    const a = await makeVenueWithWall();
    const b = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, a.venueId, "wall_manager");
    actAs(user);

    const result = await saveVenueDetails({ venueId: b.venueId, city: "Pune" });
    expect(result.ok).toBe(false);

    const rows = await q<{ city: string | null }>(`select city from venues where id = $1`, [
      b.venueId,
    ]);
    expect(rows[0].city).toBeNull();
  });

  it("a wall_manager on venue A cannot edit a WALL inside venue B", async () => {
    const a = await makeVenueWithWall();
    const b = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, a.venueId, "wall_manager");
    actAs(user);

    const result = await saveWallDetails({ wallId: b.wallId, widthCm: 300, heightCm: 200 });
    expect(result.ok).toBe(false);

    const rows = await q<{ width_cm: number | null }>(
      `select width_cm from walls where id = $1`,
      [b.wallId]
    );
    expect(rows[0].width_cm).toBeNull();
  });

  it("a wall_manager on venue A cannot price a SLOT inside venue B", async () => {
    const a = await makeVenueWithWall();
    const b = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, a.venueId, "wall_manager");
    actAs(user);

    const result = await saveSlotPricing({ slotId: b.slotIds[0], priceRupees: 1 });
    expect(result.ok).toBe(false);

    const rows = await q<{ price_paise: number | null }>(
      `select price_paise from slots where id = $1`,
      [b.slotIds[0]]
    );
    expect(rows[0].price_paise).toBeNull();
  });

  it("a wall_consultant is refused — it is a distinct role (Locked Rule 35)", async () => {
    const { venueId } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_consultant");
    actAs(user);

    expect((await saveVenueDetails({ venueId, city: "Mumbai" })).ok).toBe(false);
  });

  it("a signed-out caller is refused", async () => {
    const { venueId } = await makeVenueWithWall();
    actAs(null);
    expect((await saveVenueDetails({ venueId, city: "Mumbai" })).ok).toBe(false);
  });

  it("a revoked grant stops working immediately", async () => {
    const { venueId } = await makeVenueWithWall();
    const user = await makeUser("artist");
    const grantId = await grantTestVenueRole(user.id, venueId, "wall_manager");
    actAs(user);
    expect((await saveVenueDetails({ venueId, city: "Mumbai" })).ok).toBe(true);

    await q(`update venue_role_assignments set revoked_at = now() where id = $1`, [grantId]);
    expect((await saveVenueDetails({ venueId, city: "Pune" })).ok).toBe(false);
  });

  it("a venue_admin may edit any venue, including unstaffed ones", async () => {
    const { venueId } = await makeVenueWithWall();
    const admin = await makeUser("admin");
    await grantTestAdminRole(admin.id, "venue_admin");
    actAs(admin);

    expect((await saveVenueDetails({ venueId, city: "Chennai", venueType: "hotel" })).ok).toBe(
      true
    );
  });

  it("listManagedVenues shows only granted venues to a wall_manager", async () => {
    const a = await makeVenueWithWall();
    await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, a.venueId, "wall_manager");
    actAs(user);

    const managed = await listManagedVenues();
    expect(managed.map((v) => v.id)).toEqual([a.venueId]);
  });

  it("listVenueWalls refuses a venue the caller does not manage", async () => {
    const a = await makeVenueWithWall();
    const b = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, a.venueId, "wall_manager");
    actAs(user);

    // readSafely swallows the thrown authorization error into the fallback,
    // so "refused" here means "no rows", not an exception.
    expect(await listVenueWalls(b.venueId)).toEqual([]);
    expect((await listVenueWalls(a.venueId)).length).toBe(1);
  });
});

describe("Wall Manager — validation and pricing", () => {
  it("rejects a venue type the database would refuse", async () => {
    const { venueId } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_manager");
    actAs(user);

    expect((await saveVenueDetails({ venueId, venueType: "nightclub" })).ok).toBe(false);
  });

  it("rejects a malformed pincode and a non-positive size", async () => {
    const { venueId, wallId } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_manager");
    actAs(user);

    expect((await saveVenueDetails({ venueId, pincode: "12" })).ok).toBe(false);
    expect((await saveWallDetails({ wallId, widthCm: 0 })).ok).toBe(false);
    expect((await saveWallDetails({ wallId, widthCm: -5 })).ok).toBe(false);
  });

  it("stores rupees as paise, and an omitted price means not-for-rent", async () => {
    const { venueId, slotIds } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_manager");
    actAs(user);

    expect((await saveSlotPricing({ slotId: slotIds[0], priceRupees: 2500 })).ok).toBe(true);
    let rows = await q<{ price_paise: number | null }>(
      `select price_paise from slots where id = $1`,
      [slotIds[0]]
    );
    expect(rows[0].price_paise).toBe(250_000);

    // Clearing it must give null, not 0 — "not for rent", not "free".
    expect((await saveSlotPricing({ slotId: slotIds[0] })).ok).toBe(true);
    rows = await q(`select price_paise from slots where id = $1`, [slotIds[0]]);
    expect(rows[0].price_paise).toBeNull();
  });
});

describe("Wall Manager — listing a venue", () => {
  it("refuses to list a venue with no city, no kind, or no priced slot", async () => {
    const { venueId, slotIds } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_manager");
    actAs(user);

    // Nothing filled in at all.
    expect((await setVenueListed(venueId, true)).ok).toBe(false);

    // City and kind, but still nothing priced.
    await saveVenueDetails({ venueId, city: "Bengaluru", venueType: "cafe" });
    const noPrice = await setVenueListed(venueId, true);
    expect(noPrice.ok).toBe(false);
    expect(errorOf(noPrice)).toMatch(/price/i);

    // With a priced slot it goes through.
    await saveSlotPricing({ slotId: slotIds[0], priceRupees: 1800 });
    expect((await setVenueListed(venueId, true)).ok).toBe(true);
  });

  it("an unlisted venue is invisible to the artist-facing search", async () => {
    const { venueId, slotIds } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_manager");
    actAs(user);
    await saveVenueDetails({ venueId, city: "Kochi", venueType: "cafe" });
    await saveSlotPricing({ slotId: slotIds[0], priceRupees: 900 });

    // Still a draft: not in search, and its city is not offered as a filter.
    actAs(null);
    expect((await searchWalls({ city: "Kochi" })).length).toBe(0);
    expect(await listWallCities()).not.toContain("Kochi");

    actAs(user);
    await setVenueListed(venueId, true);

    actAs(null);
    const found = await searchWalls({ city: "Kochi" });
    expect(found.map((r) => r.venueId)).toContain(venueId);
    expect(await listWallCities()).toContain("Kochi");
  });

  it("search reports the cheapest slot and how many are free", async () => {
    const { venueId, slotIds } = await makeVenueWithWall(3);
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_manager");
    actAs(user);
    await saveVenueDetails({ venueId, city: "Jaipur", venueType: "restaurant" });
    await saveSlotPricing({ slotId: slotIds[0], priceRupees: 3000 });
    await saveSlotPricing({ slotId: slotIds[1], priceRupees: 1500 });
    // slotIds[2] stays unpriced, so it must not count as available.
    await setVenueListed(venueId, true);

    actAs(null);
    const [row] = await searchWalls({ city: "Jaipur" });
    expect(row.fromPaise).toBe(150_000);
    expect(row.availableSlots).toBe(2);
    expect(row.wallCount).toBe(1);
  });

  it("the budget filter compares against the cheapest slot", async () => {
    const { venueId, slotIds } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_manager");
    actAs(user);
    await saveVenueDetails({ venueId, city: "Surat", venueType: "cafe" });
    await saveSlotPricing({ slotId: slotIds[0], priceRupees: 2000 });
    await setVenueListed(venueId, true);

    actAs(null);
    expect((await searchWalls({ city: "Surat", maxPaise: 100_000 })).length).toBe(0);
    expect((await searchWalls({ city: "Surat", maxPaise: 200_000 })).length).toBe(1);
  });
});

/**
 * The widened virtual-wall placement gate (`requirePlacementRights`).
 *
 * Before this, hanging art was Super Admin only, which meant a venue could
 * never change its own display. A Wall Manager may now place and remove — but
 * only on slots inside a venue they are granted, which is the property worth a
 * database test, since it depends on the slot -> wall -> ... -> venue join
 * rather than on anything the caller passes.
 */
describe("virtual wall placement — venue scope", () => {
  async function makePublicArtwork(userId: string) {
    const artworkId = tid("art");
    await q(
      `insert into artworks (id, "userId", title, "imageUrl", "isPublic")
       values ($1, $2, 'Test work', 'https://example.test/a.jpg', true)`,
      [artworkId, userId]
    );
    return artworkId;
  }

  it("a wall_manager may hang art on their own venue's slot, and take it down", async () => {
    const { venueId, slotIds } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_manager");
    const artworkId = await makePublicArtwork(user.id);
    actAs(user);

    expect((await placeArtworkOnSlot({ slotId: slotIds[0], artworkId })).ok).toBe(true);
    let rows = await q(
      `select id from virtual_wall_placements where slot_id = $1 and removed_at is null`,
      [slotIds[0]]
    );
    expect(rows.length).toBe(1);

    expect((await removeArtworkFromSlot(slotIds[0])).ok).toBe(true);
    rows = await q(
      `select id from virtual_wall_placements where slot_id = $1 and removed_at is null`,
      [slotIds[0]]
    );
    expect(rows.length).toBe(0);
  });

  it("a wall_manager on venue A cannot hang art on a slot in venue B", async () => {
    const a = await makeVenueWithWall();
    const b = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, a.venueId, "wall_manager");
    const artworkId = await makePublicArtwork(user.id);
    actAs(user);

    expect((await placeArtworkOnSlot({ slotId: b.slotIds[0], artworkId })).ok).toBe(false);
    const rows = await q(
      `select id from virtual_wall_placements where slot_id = $1`,
      [b.slotIds[0]]
    );
    expect(rows.length).toBe(0);
  });

  it("a wall_consultant may not hang art (Locked Rule 35)", async () => {
    const { venueId, slotIds } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_consultant");
    const artworkId = await makePublicArtwork(user.id);
    actAs(user);

    expect((await placeArtworkOnSlot({ slotId: slotIds[0], artworkId })).ok).toBe(false);
  });

  it("canPlaceVirtualArt is true for a wall_manager and false for everyone ungranted", async () => {
    const { venueId } = await makeVenueWithWall();
    const granted = await makeUser("artist");
    await grantTestVenueRole(granted.id, venueId, "wall_manager");
    const plain = await makeUser("artist");

    actAs(granted);
    expect(await canPlaceVirtualArt()).toBe(true);

    actAs(plain);
    expect(await canPlaceVirtualArt()).toBe(false);

    actAs(null);
    expect(await canPlaceVirtualArt()).toBe(false);
  });

  it("a private artwork is still refused, grant or no grant", async () => {
    const { venueId, slotIds } = await makeVenueWithWall();
    const user = await makeUser("artist");
    await grantTestVenueRole(user.id, venueId, "wall_manager");
    const artworkId = tid("art");
    await q(
      `insert into artworks (id, "userId", title, "imageUrl", "isPublic")
       values ($1, $2, 'Private', 'https://example.test/p.jpg', false)`,
      [artworkId, user.id]
    );
    actAs(user);

    const result = await placeArtworkOnSlot({ slotId: slotIds[0], artworkId });
    expect(result.ok).toBe(false);
    expect(errorOf(result)).toMatch(/private/i);
  });
});
