"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db/index";
import {
  artworks,
  buildings,
  floors,
  roomsZones,
  virtualWallPlacements,
  walls,
  wallosSlots,
} from "@/lib/db/schema";
import { recordAudit } from "@/features/physical-wall/audit";
import {
  getActor,
  hasAdminRole,
  NotAuthorisedAdminRoleError,
  requireAdminRole,
  type Actor,
} from "@/features/physical-wall/authorize";
import {
  attempt,
  newId,
  parseInput,
  PreconditionError,
  readSafely,
  WALL_TAG,
  type Result,
} from "@/features/physical-wall/actions/shared";

/**
 * Virtual Wall — reads the 3D building, and places/removes art on its slots.
 *
 * Structure is read straight off the existing WallOS hierarchy
 * (buildings -> floors -> rooms_zones -> walls -> slots, migration 0050,
 * Locked Rule 31): there is no separate "virtual building" table and no
 * hardcoded geometry. Add a wall in the WallOS admin and it appears in the 3D
 * view; positions are derived by `./layout.ts` from hierarchy order.
 *
 * Bible notes that shaped this file:
 * - Rule 21/22 + Invariant 12: a slot is returned even with no artwork, and
 *   nothing here maps a QR to an artwork. Resolution is always
 *   `slot -> current placement -> artwork`.
 * - Invariant 1: one live placement per slot, enforced by 0073's partial
 *   unique index (the DB is the real guard) and surfaced here as a clean error.
 * - §A13 privacy masking: the public read returns title/image/artist handle
 *   only. No owner identity, no price, no price history, no wallet.
 * - §44: no demand score, not even a band, is returned here.
 * - §15/§53: this is a *virtual* exhibition surface. It deliberately does not
 *   touch `exhibitions`/`pw_bookings` and does not assert a physical binding,
 *   so `canExhibit` (binding + blockchain, i.e. the physical wall's gate) is
 *   not the gate for hanging a picture in the 3D building — see
 *   `placeArtworkOnSlot` for what is checked instead and why.
 */

const PLACE_TAG = "virtual-wall";

/** Only a published, public artwork may appear on a public 3D wall. */
const slotIdSchema = z.string({ error: "Which slot?" }).trim().min(1, "Which slot?").max(64);
const placeSchema = z.object({
  slotId: slotIdSchema,
  artworkId: z.string({ error: "Which artwork?" }).trim().min(1, "Which artwork?").max(64),
});

export interface VirtualSlot {
  id: string;
  label: string;
  /** Null for an empty slot — valid, and common (Rule 21). */
  artwork: { id: string; title: string; imageUrl: string | null } | null;
}
export interface VirtualWall {
  id: string;
  name: string;
  roomName: string;
  slots: VirtualSlot[];
}
export interface VirtualFloor {
  id: string;
  name: string;
  level: number;
  walls: VirtualWall[];
}
export interface VirtualBuilding {
  id: string;
  name: string;
  floors: VirtualFloor[];
}

/**
 * The whole building, as the 3D viewer needs it: floors in `level` order, each
 * with its walls, each with its slots and whatever currently hangs there.
 *
 * One query, then grouped in memory: the building is small (floors x walls x
 * slots), and a per-wall query would be N+1 against a shape the viewer always
 * loads whole.
 */
export async function getVirtualBuilding(buildingId: string): Promise<VirtualBuilding | null> {
  return readSafely("getVirtualBuilding", null, async () => {
    const id = parseInput(slotIdSchema, buildingId);

    const [building] = await db
      .select({ id: buildings.id, name: buildings.name })
      .from(buildings)
      .where(eq(buildings.id, id))
      .limit(1);
    if (!building) return null;

    const rows = await db
      .select({
        floorId: floors.id,
        floorName: floors.name,
        floorLevel: floors.level,
        roomName: roomsZones.name,
        wallId: walls.id,
        wallName: walls.name,
        slotId: wallosSlots.id,
        slotLabel: wallosSlots.label,
        // Left-joined: an empty slot must still come back (Rule 21).
        artworkId: artworks.id,
        artworkTitle: artworks.title,
        artworkImageUrl: artworks.imageUrl,
      })
      .from(floors)
      .innerJoin(roomsZones, eq(roomsZones.floorId, floors.id))
      .innerJoin(walls, eq(walls.roomZoneId, roomsZones.id))
      .leftJoin(wallosSlots, eq(wallosSlots.wallId, walls.id))
      .leftJoin(
        virtualWallPlacements,
        and(
          eq(virtualWallPlacements.slotId, wallosSlots.id),
          isNull(virtualWallPlacements.removedAt)
        )
      )
      // §A13: the join is narrowed to public works, so a private artwork on a
      // slot renders as an empty slot rather than leaking its title/image.
      .leftJoin(
        artworks,
        and(
          eq(artworks.id, virtualWallPlacements.artworkId),
          eq(artworks.isPublic, true)
        )
      )
      .where(eq(floors.buildingId, id))
      .orderBy(asc(floors.level), asc(walls.name), asc(wallosSlots.label));

    const floorMap = new Map<string, VirtualFloor>();
    const wallMap = new Map<string, VirtualWall>();

    for (const row of rows) {
      let floor = floorMap.get(row.floorId);
      if (!floor) {
        floor = {
          id: row.floorId,
          name: row.floorName,
          level: row.floorLevel,
          walls: [],
        };
        floorMap.set(row.floorId, floor);
      }

      let wall = wallMap.get(row.wallId);
      if (!wall) {
        wall = {
          id: row.wallId,
          name: row.wallName,
          roomName: row.roomName,
          slots: [],
        };
        wallMap.set(row.wallId, wall);
        floor.walls.push(wall);
      }

      // A wall with no slots at all still renders as a wall.
      if (!row.slotId) continue;
      wall.slots.push({
        id: row.slotId,
        label: row.slotLabel ?? row.slotId,
        artwork: row.artworkId
          ? {
              id: row.artworkId,
              title: row.artworkTitle ?? "Untitled",
              imageUrl: row.artworkImageUrl,
            }
          : null,
      });
    }

    return {
      id: building.id,
      name: building.name,
      floors: [...floorMap.values()].sort((a, b) => a.level - b.level),
    };
  });
}

/** Every building that has at least one floor — what the entry page lists. */
export async function listVirtualBuildings() {
  return readSafely("listVirtualBuildings", [], () =>
    db
      .selectDistinct({ id: buildings.id, name: buildings.name })
      .from(buildings)
      .innerJoin(floors, eq(floors.buildingId, buildings.id))
      .orderBy(asc(buildings.name))
  );
}

/**
 * Is the *current* caller allowed to place art? Super Admin only.
 *
 * This exists so a page can decide whether to render the placement UI at all.
 * It is NOT the permission: `placeArtworkOnSlot`/`removeArtworkFromSlot`
 * re-check server-side on every write (Locked Rule 42), because a hidden
 * button is not authorization and a server action is a public endpoint.
 */
export async function canPlaceVirtualArt(): Promise<boolean> {
  try {
    return (await hasAdminRole(await getActor(), "super_admin")) === true;
  } catch (error) {
    // Default-deny: an unreadable role must never render the placement UI.
    console.error("[virtual-wall] Could not resolve placement permission", error);
    return false;
  }
}

/**
 * Super Admin only: hang `artworkId` on `slotId`.
 *
 * The gate is `requireAdminRole("super_admin")` — the project's existing
 * authorization (admin_role_assignments joined to admin_roles, read live so a
 * revocation takes effect immediately), not a new permission system. Note
 * `hasAdminRole` treats `super_admin` as satisfying every role, so asking for
 * `super_admin` specifically means *only* Super Admin passes here.
 *
 * Ids are re-resolved against the DB rather than trusted (§105): a
 * syntactically valid slot id that does not exist, or an artwork that is not
 * the caller's to show publicly, fails before any write.
 *
 * Why not `canExhibit`: that gate requires an active physical binding (B2+)
 * and blockchain approval (P3+), which are the conditions for occupying a
 * *physical* wall slot (Rules 17-18). This building is virtual (§15/§53) — no
 * crate ships, nothing is installed, no QR is bound — so requiring a physical
 * binding would make the 3D wall unusable for exactly the works it exists to
 * show. What is enforced instead: the artwork must exist and be public
 * (§A13), and only Super Admin decides. If product later wants the physical
 * gate here too, call `canExhibit(await loadTrustDimensions(artworkId))` and
 * log it via `logPolicyDecision` — deliberately not done now rather than
 * guessed at.
 */
export async function placeArtworkOnSlot(raw: {
  slotId: string;
  artworkId: string;
}): Promise<Result<string>> {
  return attempt("placeArtworkOnSlot", async () => {
    const actor = await requireSuperAdmin();
    const input = parseInput(placeSchema, raw);

    const [slot] = await db
      .select({ id: wallosSlots.id, label: wallosSlots.label })
      .from(wallosSlots)
      .where(eq(wallosSlots.id, input.slotId))
      .limit(1);
    if (!slot) throw new PreconditionError(`No slot with id "${input.slotId}".`);

    const [artwork] = await db
      .select({ id: artworks.id, title: artworks.title, isPublic: artworks.isPublic })
      .from(artworks)
      .where(eq(artworks.id, input.artworkId))
      .limit(1);
    if (!artwork) throw new PreconditionError(`No artwork with id "${input.artworkId}".`);
    if (!artwork.isPublic) {
      throw new PreconditionError("That artwork is private. Make it public before showing it.");
    }

    // Invariant 1: one live placement per slot. Checked here for a readable
    // message; 0073's partial unique index is what actually guarantees it
    // under a concurrent second placement.
    const [occupied] = await db
      .select({ id: virtualWallPlacements.id })
      .from(virtualWallPlacements)
      .where(
        and(
          eq(virtualWallPlacements.slotId, input.slotId),
          isNull(virtualWallPlacements.removedAt)
        )
      )
      .limit(1);
    if (occupied) {
      throw new PreconditionError("That slot already has a work on it. Remove it first.");
    }

    const id = newId("vwp");
    try {
      await db.insert(virtualWallPlacements).values({
        id,
        slotId: input.slotId,
        artworkId: input.artworkId,
        placedBy: actor.id,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PreconditionError(
          "That slot or artwork is already placed. Refresh and try again."
        );
      }
      throw error;
    }

    await recordAudit({
      actor,
      action: "virtual_wall.place",
      subjectType: "slot",
      subjectId: input.slotId,
      after: { placementId: id, artworkId: input.artworkId },
    });

    updateTag(PLACE_TAG);
    updateTag(WALL_TAG);
    return id;
  });
}

/** Super Admin only: take whatever currently hangs on `slotId` down. */
export async function removeArtworkFromSlot(rawSlotId: string): Promise<Result<void>> {
  return attempt("removeArtworkFromSlot", async () => {
    const actor = await requireSuperAdmin();
    const slotId = parseInput(slotIdSchema, rawSlotId);

    const rows = await db
      .update(virtualWallPlacements)
      .set({ removedAt: new Date(), removedBy: actor.id })
      .where(
        and(
          eq(virtualWallPlacements.slotId, slotId),
          isNull(virtualWallPlacements.removedAt)
        )
      )
      .returning({ id: virtualWallPlacements.id, artworkId: virtualWallPlacements.artworkId });

    if (rows.length === 0) throw new PreconditionError("Nothing is on that slot.");

    await recordAudit({
      actor,
      action: "virtual_wall.remove",
      subjectType: "slot",
      subjectId: slotId,
      before: { placementId: rows[0].id, artworkId: rows[0].artworkId },
    });

    updateTag(PLACE_TAG);
    updateTag(WALL_TAG);
  });
}

/**
 * The one gate both writes share. Separate function so there is exactly one
 * place that decides what "may place art" means, and so the test can assert
 * that a non-super-admin is refused without going through the UI.
 */
async function requireSuperAdmin(): Promise<Actor> {
  return requireAdminRole("super_admin");
}

/** Postgres unique_violation (23505), however the driver wraps it. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error as { code: unknown }).code === "23505") return true;
  const cause = (error as { cause?: unknown }).cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code: unknown }).code === "23505"
  );
}

export { NotAuthorisedAdminRoleError };
