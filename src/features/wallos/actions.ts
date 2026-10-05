"use server";

import { and, eq } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";

import { db } from "@/lib/db/index";
import {
  buildings,
  floors,
  organizations,
  roomsZones,
  venues,
  walls,
  wallosSlots,
} from "@/lib/db/schema";
import { requireRole } from "@/features/physical-wall/authorize";
import {
  attempt,
  newId,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";

/**
 * BE-3.13: CRUD for the WallOS hierarchy (organizations -> venues ->
 * buildings -> floors -> rooms_zones -> walls -> slots), 0050's parallel
 * structure alongside pw_slots (see that migration's header — this file
 * never touches pw_slots/pw_bookings).
 *
 * One generic CRUD core instead of 7 near-identical create/read/update/delete
 * functions: every level is "an id, a parent id (except organizations), a
 * name, timestamps" and differs only in table + parent column + id prefix.
 * FK integrity is enforced twice, deliberately: the DB constraint is the real
 * guard (0050), and a pre-insert existence check here exists only so a bad
 * parent id fails with a clean PreconditionError instead of a raw Postgres
 * 23503 reaching toActionError's catch-all (BE-2.15).
 */

type Level = {
  table: PgTable & { id: AnyPgColumn; name: AnyPgColumn };
  prefix: string;
  parent?: { table: PgTable & { id: AnyPgColumn }; column: AnyPgColumn; label: string };
};

type LevelName = "organization" | "venue" | "building" | "floor" | "roomZone" | "wall";

const LEVELS: Record<LevelName, Level> = {
  organization: { table: organizations, prefix: "org" },
  venue: { table: venues, prefix: "venue", parent: { table: organizations, column: venues.organizationId, label: "organization" } },
  building: { table: buildings, prefix: "bldg", parent: { table: venues, column: buildings.venueId, label: "venue" } },
  floor: { table: floors, prefix: "floor", parent: { table: buildings, column: floors.buildingId, label: "building" } },
  roomZone: { table: roomsZones, prefix: "zone", parent: { table: floors, column: roomsZones.floorId, label: "floor" } },
  wall: { table: walls, prefix: "wall", parent: { table: roomsZones, column: walls.roomZoneId, label: "room/zone" } },
};

const nameSchema = z.object({
  name: z.string({ error: "Give it a name." }).trim().min(1, "Give it a name.").max(160),
  parentId: z.string().trim().min(1).max(64).optional(),
});
const idSchema = z.string({ error: "Which one?" }).trim().min(1, "Which one?").max(64);

async function assertParentExists(level: Level, parentId: string | undefined): Promise<void> {
  if (!level.parent) return;
  if (!parentId) throw new PreconditionError(`Give the ${level.parent.label} this belongs to.`);
  const [row] = await db.select({ id: level.parent.table.id }).from(level.parent.table).where(eq(level.parent.table.id, parentId));
  if (!row) throw new PreconditionError(`No ${level.parent.label} with id "${parentId}".`);
}

/** Create a row at `level`. Admin-only; parent existence is checked before the insert (clean error, not a raw FK violation). */
export async function createWallosNode(
  level: LevelName,
  raw: { name: string; parentId?: string }
): Promise<Result<string>> {
  return attempt(`createWallosNode(${level})`, async () => {
    await requireRole("admin");
    const def = LEVELS[level];
    const input = parseInput(nameSchema, raw);
    await assertParentExists(def, input.parentId);

    const id = newId(def.prefix);
    const values: Record<string, unknown> = { id, name: input.name };
    if (def.parent) values[columnKey(def.parent.column)] = input.parentId;
    await db.insert(def.table as PgTable).values(values);
    return id;
  });
}

const optionalIdSchema = z.string().trim().min(1).max(64).optional();

/** List every row at `level`, optionally filtered to one parent. */
export async function listWallosNodes(level: LevelName, parentId?: string) {
  return readSafely(`listWallosNodes(${level})`, [], async () => {
    const parsedParentId = parseInput(optionalIdSchema, parentId);
    const def = LEVELS[level];
    const base = db.select().from(def.table as PgTable);
    if (def.parent && parsedParentId) {
      return base.where(eq(def.parent.column, parsedParentId));
    }
    return base;
  });
}

/** Rename a row at `level`. Admin-only. */
export async function updateWallosNode(level: LevelName, id: string, name: string): Promise<Result<void>> {
  return attempt(`updateWallosNode(${level})`, async () => {
    await requireRole("admin");
    const def = LEVELS[level];
    const input = parseInput(z.object({ id: idSchema, name: nameSchema.shape.name }), { id, name });
    const rows = await db.update(def.table as PgTable).set({ name: input.name } as never).where(eq(def.table.id, input.id)).returning({ id: def.table.id });
    if (rows.length === 0) throw new PreconditionError(`No ${level} with id "${id}".`);
  });
}

/** Delete a row at `level`. Admin-only. A row with children, or a slot still referenced by pw_slots, is rejected by the DB's `restrict` FKs — surfaced here as a clean error. */
export async function deleteWallosNode(level: LevelName, id: string): Promise<Result<void>> {
  return attempt(`deleteWallosNode(${level})`, async () => {
    await requireRole("admin");
    const def = LEVELS[level];
    const nodeId = parseInput(idSchema, id);
    try {
      const rows = await db.delete(def.table as PgTable).where(eq(def.table.id, nodeId)).returning({ id: def.table.id });
      if (rows.length === 0) throw new PreconditionError(`No ${level} with id "${id}".`);
    } catch (error) {
      if (isFkViolation(error)) {
        throw new PreconditionError(`This ${level} still has child rows (or a referencing slot) and can't be deleted.`);
      }
      throw error;
    }
  });
}

/** True for a Postgres foreign_key_violation (23503), however the driver wraps it (Drizzle wraps the pg error in DrizzleQueryError's `.cause`). */
function isFkViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error as { code: unknown }).code === "23503") return true;
  const cause = (error as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && "code" in cause && (cause as { code: unknown }).code === "23503";
}

/** The Drizzle column's underlying snake_case key, so a plain object can target it by name. */
function columnKey(column: AnyPgColumn): string {
  return column.name
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// ── Slots (the hierarchy's leaf) ────────────────────────────────────────────

const slotSchema = z.object({
  wallId: z.string().trim().min(1).max(64),
  label: z.string({ error: "Give the slot a label." }).trim().min(1, "Give the slot a label.").max(160),
});

/** Create a slot under a wall. `onChainSlotId` (BE-3.14) is never set here — Growth-phase, N/A for MVP. */
export async function createWallosSlot(raw: { wallId: string; label: string }): Promise<Result<string>> {
  return attempt("createWallosSlot", async () => {
    await requireRole("admin");
    const input = parseInput(slotSchema, raw);
    const [wall] = await db.select({ id: walls.id }).from(walls).where(eq(walls.id, input.wallId));
    if (!wall) throw new PreconditionError(`No wall with id "${input.wallId}".`);

    const id = newId("slot");
    await db.insert(wallosSlots).values({ id, wallId: input.wallId, label: input.label });
    return id;
  });
}

export async function listWallosSlots(wallId: string) {
  return readSafely("listWallosSlots", [], () => {
    const parsedWallId = parseInput(idSchema, wallId);
    return db.select().from(wallosSlots).where(eq(wallosSlots.wallId, parsedWallId));
  });
}

export async function updateWallosSlot(id: string, label: string): Promise<Result<void>> {
  return attempt("updateWallosSlot", async () => {
    await requireRole("admin");
    const input = parseInput(z.object({ id: idSchema, label: slotSchema.shape.label }), { id, label });
    const rows = await db.update(wallosSlots).set({ label: input.label }).where(eq(wallosSlots.id, input.id)).returning({ id: wallosSlots.id });
    if (rows.length === 0) throw new PreconditionError(`No slot with id "${id}".`);
  });
}

export async function deleteWallosSlot(id: string): Promise<Result<void>> {
  return attempt("deleteWallosSlot", async () => {
    await requireRole("admin");
    const slotId = parseInput(idSchema, id);
    try {
      const rows = await db.delete(wallosSlots).where(eq(wallosSlots.id, slotId)).returning({ id: wallosSlots.id });
      if (rows.length === 0) throw new PreconditionError(`No slot with id "${id}".`);
    } catch (error) {
      if (isFkViolation(error)) {
        throw new PreconditionError("This slot is still referenced by a physical-wall slot (pw_slots) and can't be deleted.");
      }
      throw error;
    }
  });
}

/** For tests/diagnostics: walk a wallosSlots.id up to its organization. Not used by the live booking flow. */
export async function getSlotOrganization(slotId: string) {
  return readSafely("getSlotOrganization", null, async () => {
    const parsedSlotId = parseInput(idSchema, slotId);
    const [row] = await db
      .select({ organizationId: organizations.id, organizationName: organizations.name, venueId: venues.id })
      .from(wallosSlots)
      .innerJoin(walls, eq(wallosSlots.wallId, walls.id))
      .innerJoin(roomsZones, eq(walls.roomZoneId, roomsZones.id))
      .innerJoin(floors, eq(roomsZones.floorId, floors.id))
      .innerJoin(buildings, eq(floors.buildingId, buildings.id))
      .innerJoin(venues, eq(buildings.venueId, venues.id))
      .innerJoin(organizations, eq(venues.organizationId, organizations.id))
      .where(and(eq(wallosSlots.id, parsedSlotId)));
    return row ?? null;
  });
}
