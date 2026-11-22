"use server";

import { and, asc, eq, inArray, isNotNull, isNull, sql as rawSql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db/index";
import {
  buildings,
  floors,
  roomsZones,
  venues,
  virtualWallPlacements,
  walls,
  wallosSlots,
} from "@/lib/db/schema";
import { recordAudit } from "@/features/physical-wall/audit";
import {
  getActor,
  hasAdminRole,
  hasVenueRole,
  listOwnVenues,
  NotAuthorisedVenueRoleError,
  type Actor,
} from "@/features/physical-wall/authorize";
import { VENUE_TYPES } from "@/features/wallos/wall-manager/venue-types";
import {
  attempt,
  fail,
  firstIssue,
  ok,
  parseInput,
  PreconditionError,
  readSafely,
  WALL_TAG,
  type ActionState,
  type Result,
} from "@/features/physical-wall/actions/shared";

/**
 * Wall Manager - the venue-side surface for the attributes migration 0086
 * added: where a venue is, how big its walls are, and what its slots cost.
 *
 * ## Why this is not more functions in features/wallos/actions.ts
 *
 * That file is the *structure* CRUD (create a floor, rename a wall) and is
 * gated `requireAdminRole("venue_admin")` - a global, internal-staff role. A
 * Wall Manager is venue-side staff with authority over **specific assigned
 * venues** (Bible section 13, Locked Rule 34), which is a different question
 * than "is this person platform staff". So the gate here is
 * `requireVenueScope(venueId)`, which accepts either:
 *
 *   * a `wall_manager` grant on *that one venue* (venue_role_assignments,
 *     migration 0081), or
 *   * the global `venue_admin` admin role, because platform staff administering
 *     the wall network must not be locked out of a venue nobody has staffed yet.
 *
 * `wall_consultant` is deliberately NOT accepted: Locked Rule 35 makes the
 * consultant a distinct, external advisory role, and `hasVenueRole` compares
 * the role exactly for exactly this reason.
 *
 * ## Why every write re-resolves the venue from the row
 *
 * A wall id and a slot id do not carry their venue, so a caller who passed
 * someone else's wall id would otherwise be checked against a venue they do
 * control. Each write walks the row back up the hierarchy to its venue
 * (`venueIdForWall` / `venueIdForSlot`) and authorizes against *that*, so the
 * grant is always checked against the row actually being changed.
 */

const PLACE_TAG = "virtual-wall";

const idSchema = z.string({ error: "Which one?" }).trim().min(1, "Which one?").max(64);

/** Centimetres: a whole number, and a wall nobody could hang on is rejected. */
const cmSchema = z.coerce
  .number({ error: "Give a size in whole centimetres." })
  .int("Use whole centimetres.")
  .positive("A size has to be more than zero.")
  .max(10_000, "That is larger than any real wall.")
  .optional();

/** Rupees in, paise stored - every other money column in this schema is paise. */
const rupeesSchema = z.coerce
  .number({ error: "Give a price in rupees." })
  .min(0, "A price cannot be negative.")
  .max(10_000_000, "That price looks wrong.")
  .optional();

const venueDetailsSchema = z.object({
  venueId: idSchema,
  venueType: z.enum(VENUE_TYPES, { error: "Pick what kind of place this is." }).optional(),
  addressLine: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, "An Indian pincode is six digits.")
    .optional(),
  description: z.string().trim().max(2000).optional(),
});

const wallDetailsSchema = z.object({
  wallId: idSchema,
  widthCm: cmSchema,
  heightCm: cmSchema,
  notes: z.string().trim().max(2000).optional(),
});

const slotPricingSchema = z.object({
  slotId: idSchema,
  /** Undefined clears the price, i.e. "not for rent". */
  priceRupees: rupeesSchema,
  periodDays: z.coerce
    .number({ error: "Give a booking length in days." })
    .int("Use whole days.")
    .positive("A booking has to run at least a day.")
    .max(3650, "That is longer than any slot is let for.")
    .optional(),
  widthCm: cmSchema,
  heightCm: cmSchema,
});

/** Empty strings arrive from unfilled form fields; treat them as "not set". */
function blankToUndefined(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" || v === null ? undefined : v])
  );
}

// -- authorization -----------------------------------------------------------

/**
 * May the caller administer `venueId`? A `wall_manager` grant on that venue,
 * or the global `venue_admin` admin role. Never `wall_consultant` (Rule 35).
 */
async function requireVenueScope(venueId: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new NotAuthorisedVenueRoleError("wall_manager", venueId);
  if (await hasVenueRole(actor, venueId, "wall_manager")) return actor;
  if (await hasAdminRole(actor, "venue_admin")) return actor;
  throw new NotAuthorisedVenueRoleError("wall_manager", venueId);
}

async function venueIdForWall(wallId: string): Promise<string> {
  const [row] = await db
    .select({ venueId: buildings.venueId })
    .from(walls)
    .innerJoin(roomsZones, eq(walls.roomZoneId, roomsZones.id))
    .innerJoin(floors, eq(roomsZones.floorId, floors.id))
    .innerJoin(buildings, eq(floors.buildingId, buildings.id))
    .where(eq(walls.id, wallId))
    .limit(1);
  if (!row) throw new PreconditionError(`No wall with id "${wallId}".`);
  return row.venueId;
}

async function venueIdForSlot(slotId: string): Promise<string> {
  const [row] = await db
    .select({ venueId: buildings.venueId })
    .from(wallosSlots)
    .innerJoin(walls, eq(wallosSlots.wallId, walls.id))
    .innerJoin(roomsZones, eq(walls.roomZoneId, roomsZones.id))
    .innerJoin(floors, eq(roomsZones.floorId, floors.id))
    .innerJoin(buildings, eq(floors.buildingId, buildings.id))
    .where(eq(wallosSlots.id, slotId))
    .limit(1);
  if (!row) throw new PreconditionError(`No slot with id "${slotId}".`);
  return row.venueId;
}

// -- writes ------------------------------------------------------------------

/** Set a venue's kind and address - what the artist-facing search filters on. */
export async function saveVenueDetails(raw: Record<string, unknown>): Promise<Result<void>> {
  return attempt("saveVenueDetails", async () => {
    const input = parseInput(venueDetailsSchema, blankToUndefined(raw));
    const actor = await requireVenueScope(input.venueId);

    const rows = await db
      .update(venues)
      .set({
        venueType: input.venueType ?? null,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        pincode: input.pincode ?? null,
        description: input.description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(venues.id, input.venueId))
      .returning({ id: venues.id });
    if (rows.length === 0) throw new PreconditionError(`No venue with id "${input.venueId}".`);

    await recordAudit({
      actor,
      action: "wall_manager.venue_details",
      subjectType: "venue",
      subjectId: input.venueId,
      after: { city: input.city, venueType: input.venueType },
    });
    updateTag(WALL_TAG);
  });
}

/**
 * Show or hide a venue in the artist-facing search.
 *
 * Listing is refused unless the venue has the things an artist would filter
 * and choose on - a kind, a city, and at least one priced slot. A venue that
 * appears in search with no price is a dead end the artist only discovers
 * after clicking, so the precondition lives here rather than in the UI alone.
 */
export async function setVenueListed(
  rawVenueId: string,
  listed: boolean
): Promise<Result<void>> {
  return attempt("setVenueListed", async () => {
    const venueId = parseInput(idSchema, rawVenueId);
    const wantListed = parseInput(z.boolean({ error: "Listed or not?" }), listed);
    const actor = await requireVenueScope(venueId);

    const [venue] = await db
      .select({ id: venues.id, city: venues.city, venueType: venues.venueType })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (!venue) throw new PreconditionError(`No venue with id "${venueId}".`);

    if (wantListed) {
      if (!venue.city || !venue.venueType) {
        throw new PreconditionError(
          "Set the city and the kind of place before listing this venue."
        );
      }
      const [priced] = await db
        .select({ id: wallosSlots.id })
        .from(wallosSlots)
        .innerJoin(walls, eq(wallosSlots.wallId, walls.id))
        .innerJoin(roomsZones, eq(walls.roomZoneId, roomsZones.id))
        .innerJoin(floors, eq(roomsZones.floorId, floors.id))
        .innerJoin(buildings, eq(floors.buildingId, buildings.id))
        .where(and(eq(buildings.venueId, venueId), isNotNull(wallosSlots.pricePaise)))
        .limit(1);
      if (!priced) {
        throw new PreconditionError("Price at least one slot before listing this venue.");
      }
    }

    await db
      .update(venues)
      .set({ listed: wantListed, updatedAt: new Date() })
      .where(eq(venues.id, venueId));

    await recordAudit({
      actor,
      action: wantListed ? "wall_manager.venue_listed" : "wall_manager.venue_unlisted",
      subjectType: "venue",
      subjectId: venueId,
      after: { listed: wantListed },
    });
    updateTag(WALL_TAG);
  });
}

/** Record a wall's measured size and the note an artist reads before booking. */
export async function saveWallDetails(raw: Record<string, unknown>): Promise<Result<void>> {
  return attempt("saveWallDetails", async () => {
    const input = parseInput(wallDetailsSchema, blankToUndefined(raw));
    const actor = await requireVenueScope(await venueIdForWall(input.wallId));

    await db
      .update(walls)
      .set({
        widthCm: input.widthCm ?? null,
        heightCm: input.heightCm ?? null,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(walls.id, input.wallId));

    await recordAudit({
      actor,
      action: "wall_manager.wall_details",
      subjectType: "wall",
      subjectId: input.wallId,
      after: { widthCm: input.widthCm, heightCm: input.heightCm },
    });
    updateTag(WALL_TAG);
  });
}

/**
 * Price one slot. Rupees in the form, paise in the column.
 *
 * An omitted price clears it, which means "not for rent" rather than free -
 * see 0086's comment on why null and 0 must stay distinct.
 */
export async function saveSlotPricing(raw: Record<string, unknown>): Promise<Result<void>> {
  return attempt("saveSlotPricing", async () => {
    const input = parseInput(slotPricingSchema, blankToUndefined(raw));
    const actor = await requireVenueScope(await venueIdForSlot(input.slotId));

    await db
      .update(wallosSlots)
      .set({
        pricePaise:
          input.priceRupees === undefined ? null : Math.round(input.priceRupees * 100),
        periodDays: input.periodDays ?? 30,
        widthCm: input.widthCm ?? null,
        heightCm: input.heightCm ?? null,
        updatedAt: new Date(),
      })
      .where(eq(wallosSlots.id, input.slotId));

    await recordAudit({
      actor,
      action: "wall_manager.slot_pricing",
      subjectType: "slot",
      subjectId: input.slotId,
      after: { priceRupees: input.priceRupees, periodDays: input.periodDays },
    });
    updateTag(WALL_TAG);
    updateTag(PLACE_TAG);
  });
}

// -- reads -------------------------------------------------------------------

/** The venues this caller may manage. Empty for everyone else. */
export async function listManagedVenues() {
  return readSafely("listManagedVenues", [], async () => {
    const actor = await getActor();
    if (!actor) return [];

    const columns = {
      id: venues.id,
      name: venues.name,
      venueType: venues.venueType,
      addressLine: venues.addressLine,
      city: venues.city,
      state: venues.state,
      pincode: venues.pincode,
      listed: venues.listed,
      description: venues.description,
    };

    // venue_admin administers the whole network; a Wall Manager sees only the
    // venues granted to them.
    if (await hasAdminRole(actor, "venue_admin")) {
      return db.select(columns).from(venues).orderBy(asc(venues.name));
    }
    const own = await listOwnVenues(actor, "wall_manager");
    if (own.length === 0) return [];
    return db
      .select(columns)
      .from(venues)
      .where(inArray(venues.id, own))
      .orderBy(asc(venues.name));
  });
}

export interface ManagedSlot {
  id: string;
  label: string;
  pricePaise: number | null;
  periodDays: number;
  widthCm: number | null;
  heightCm: number | null;
  artworkId: string | null;
}

export interface ManagedWall {
  id: string;
  name: string;
  roomName: string;
  floorName: string;
  buildingName: string;
  widthCm: number | null;
  heightCm: number | null;
  notes: string | null;
  slots: ManagedSlot[];
}

/**
 * Every wall of one venue, with its slots, their prices and whatever hangs on
 * them - the whole Wall Manager screen in one query rather than N+1 per wall.
 */
export async function listVenueWalls(rawVenueId: string): Promise<ManagedWall[]> {
  return readSafely("listVenueWalls", [], async () => {
    const venueId = parseInput(idSchema, rawVenueId);
    await requireVenueScope(venueId);

    const rows = await db
      .select({
        wallId: walls.id,
        wallName: walls.name,
        wallWidth: walls.widthCm,
        wallHeight: walls.heightCm,
        wallNotes: walls.notes,
        roomName: roomsZones.name,
        floorName: floors.name,
        floorLevel: floors.level,
        buildingName: buildings.name,
        slotId: wallosSlots.id,
        slotLabel: wallosSlots.label,
        pricePaise: wallosSlots.pricePaise,
        periodDays: wallosSlots.periodDays,
        slotWidth: wallosSlots.widthCm,
        slotHeight: wallosSlots.heightCm,
        artworkId: virtualWallPlacements.artworkId,
      })
      .from(walls)
      .innerJoin(roomsZones, eq(walls.roomZoneId, roomsZones.id))
      .innerJoin(floors, eq(roomsZones.floorId, floors.id))
      .innerJoin(buildings, eq(floors.buildingId, buildings.id))
      .leftJoin(wallosSlots, eq(wallosSlots.wallId, walls.id))
      .leftJoin(
        virtualWallPlacements,
        and(
          eq(virtualWallPlacements.slotId, wallosSlots.id),
          isNull(virtualWallPlacements.removedAt)
        )
      )
      .where(eq(buildings.venueId, venueId))
      .orderBy(asc(floors.level), asc(walls.name), asc(wallosSlots.label));

    const wallMap = new Map<string, ManagedWall>();
    for (const row of rows) {
      let wall = wallMap.get(row.wallId);
      if (!wall) {
        wall = {
          id: row.wallId,
          name: row.wallName,
          roomName: row.roomName,
          floorName: row.floorName,
          buildingName: row.buildingName,
          widthCm: row.wallWidth,
          heightCm: row.wallHeight,
          notes: row.wallNotes,
          slots: [],
        };
        wallMap.set(row.wallId, wall);
      }
      if (!row.slotId) continue;
      wall.slots.push({
        id: row.slotId,
        label: row.slotLabel ?? row.slotId,
        pricePaise: row.pricePaise,
        // The column is `not null default 30`; it types as nullable only
        // because the slot join above is a LEFT join.
        periodDays: row.periodDays ?? 30,
        widthCm: row.slotWidth,
        heightCm: row.slotHeight,
        artworkId: row.artworkId,
      });
    }
    return [...wallMap.values()];
  });
}

export interface WallSearchResult {
  venueId: string;
  venueName: string;
  venueType: string | null;
  city: string | null;
  state: string | null;
  addressLine: string | null;
  description: string | null;
  wallCount: number;
  availableSlots: number;
  fromPaise: number | null;
}

const searchSchema = z.object({
  city: z.string().trim().max(120).optional(),
  venueType: z.enum(VENUE_TYPES).optional(),
  maxPaise: z.coerce.number().int().positive().optional(),
});

/**
 * The artist-facing wall search: listed venues, filtered by city and kind,
 * each with how many slots are free and the cheapest one.
 *
 * Public by design - an artist deciding whether to join needs to see where
 * walls are before signing up, so this reads only `listed` venues and
 * exposes nothing a venue has not published.
 */
export async function searchWalls(raw?: {
  city?: string;
  venueType?: string;
  maxPaise?: number;
}): Promise<WallSearchResult[]> {
  return readSafely("searchWalls", [], async () => {
    const input = parseInput(searchSchema, blankToUndefined({ ...raw }));

    const conditions = [eq(venues.listed, true)];
    if (input.city) conditions.push(eq(venues.city, input.city));
    if (input.venueType) conditions.push(eq(venues.venueType, input.venueType));

    const rows = await db
      .select({
        venueId: venues.id,
        venueName: venues.name,
        venueType: venues.venueType,
        city: venues.city,
        state: venues.state,
        addressLine: venues.addressLine,
        description: venues.description,
        wallCount: rawSql<number>`count(distinct ${walls.id})::int`,
        availableSlots: rawSql<number>`count(distinct case
          when ${wallosSlots.pricePaise} is not null
           and ${virtualWallPlacements.id} is null
          then ${wallosSlots.id} end)::int`,
        fromPaise: rawSql<number | null>`min(${wallosSlots.pricePaise})`,
      })
      .from(venues)
      .innerJoin(buildings, eq(buildings.venueId, venues.id))
      .innerJoin(floors, eq(floors.buildingId, buildings.id))
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
      .where(and(...conditions))
      .groupBy(
        venues.id,
        venues.name,
        venues.venueType,
        venues.city,
        venues.state,
        venues.addressLine,
        venues.description
      )
      .orderBy(asc(venues.city), asc(venues.name));

    // Applied after the aggregate: `maxPaise` is a budget on the cheapest
    // slot, which only exists once min() has been computed.
    const max = input.maxPaise;
    return max === undefined
      ? rows
      : rows.filter((r) => r.fromPaise !== null && r.fromPaise <= max);
  });
}

/** The cities that have at least one listed venue - what the filter offers. */
export async function listWallCities(): Promise<string[]> {
  return readSafely("listWallCities", [], async () => {
    const rows = await db
      .selectDistinct({ city: venues.city })
      .from(venues)
      .where(and(eq(venues.listed, true), isNotNull(venues.city)))
      .orderBy(asc(venues.city));
    return rows.map((r) => r.city).filter((c): c is string => Boolean(c));
  });
}

// -- form-action wrappers ----------------------------------------------------
//
// The functions above take plain objects, which is what a server-side caller
// and a test want. These adapt them to `useActionState`, which hands over a
// FormData. Same split as features/wallos/actions.ts.

/** Save a venue's kind, address and description from the Wall Manager form. */
export async function saveVenueDetailsForm(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const parsed = venueDetailsSchema.safeParse(
      blankToUndefined(Object.fromEntries(formData))
    );
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const result = await saveVenueDetails(parsed.data);
    return result.ok ? ok("Venue saved.") : fail(result.error);
  } catch {
    return fail("That didn't work.");
  }
}

/** Save one wall's measured size and note. */
export async function saveWallDetailsForm(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const parsed = wallDetailsSchema.safeParse(
      blankToUndefined(Object.fromEntries(formData))
    );
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const result = await saveWallDetails(parsed.data);
    return result.ok ? ok("Wall saved.") : fail(result.error);
  } catch {
    return fail("That didn't work.");
  }
}

/** Price one slot. */
export async function saveSlotPricingForm(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const parsed = slotPricingSchema.safeParse(
      blankToUndefined(Object.fromEntries(formData))
    );
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const result = await saveSlotPricing(parsed.data);
    return result.ok ? ok("Slot saved.") : fail(result.error);
  } catch {
    return fail("That didn't work.");
  }
}

/**
 * List or unlist a venue. The button carries `listed` as "true"/"false", so
 * the string is mapped to a boolean here rather than trusting a cast.
 */
export async function setVenueListedForm(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const parsed = z
      .object({ venueId: idSchema, listed: z.enum(["true", "false"]) })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Which venue?");
    const listed = parsed.data.listed === "true";
    const result = await setVenueListed(parsed.data.venueId, listed);
    return result.ok
      ? ok(listed ? "Venue is now listed for artists." : "Venue hidden from search.")
      : fail(result.error);
  } catch {
    return fail("That didn't work.");
  }
}
