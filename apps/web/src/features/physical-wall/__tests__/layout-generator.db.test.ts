import { afterAll, describe, expect, it } from "vitest";

import { purgeTestData, q, tid } from "@/test/fixtures";
import { planLayout } from "@/features/physical-wall/layout-plan";
import { isOccupied, type SlotState } from "@/features/physical-wall/state-machine";

/**
 * The layout generator's destructive path, against a real database.
 *
 * `generateLayout` itself needs an admin session, so what is exercised here is
 * the exact SQL and the exact decision it makes: which slots fall outside the
 * planned bounds, and whether any of them is occupied. That decision is the
 * only thing standing between a regenerate and somebody's booking, so it is
 * tested against real rows rather than trusted.
 */

afterAll(purgeTestData);

async function makeGrid(rows: number, cols: number) {
  const gridId = tid("grid");
  const sizeId = tid("sz");
  const typeId = tid("ty");

  await q(
    `insert into pw_size_catalog (id, name, w_cm, h_cm, weight_kg, base_price_paise, active, sort_order)
     values ($1, 'Test A4', 21, 30, 2, 150000, true, 1)`,
    [sizeId]
  );
  await q(
    `insert into pw_slot_types (id, label, multiplier_bp, requires_grant, active, sort_order)
     values ($1, 'Test standard', 10000, false, true, 1)`,
    [typeId]
  );
  await q(
    `insert into pw_grid_config (id, name, row_count, col_count, is_template, active)
     values ($1, 'Test wall', $2, $3, false, false)`,
    [gridId, rows, cols]
  );
  return { gridId, sizeId, typeId };
}

async function addSlot(
  gridId: string,
  sizeId: string,
  typeId: string,
  row: number,
  col: number,
  state: SlotState
) {
  const id = tid("slot");
  await q(
    `insert into pw_slots (id, grid_id, row_index, col_index, label, size_id, type_id, state)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, gridId, row, col, `R${row}C${col}`, sizeId, typeId, state]
  );
  return id;
}

/** The generator's own "which rows are in the way" query. */
async function slotsOutside(gridId: string, rowCount: number, colCount: number) {
  return q<{ id: string; label: string; state: SlotState }>(
    `select id, label, state from pw_slots
     where grid_id = $1 and (row_index >= $2 or col_index >= $3)`,
    [gridId, rowCount, colCount]
  );
}

describe("generateLayout's destructive path", () => {
  it("names an occupied slot that a smaller layout would remove", async () => {
    const { gridId, sizeId, typeId } = await makeGrid(3, 3);
    await addSlot(gridId, sizeId, typeId, 0, 0, "available");
    const booked = await addSlot(gridId, sizeId, typeId, 2, 2, "booked");

    // A wall that plans to 2x2 would orphan the slot at (2,2).
    const outside = await slotsOutside(gridId, 2, 2);
    const blocking = outside.filter((slot) => isOccupied(slot.state));

    expect(outside.map((s) => s.id)).toContain(booked);
    expect(blocking).toHaveLength(1);
    expect(blocking[0].state).toBe("booked");
  });

  it("lets a smaller layout proceed when the slots it drops are empty", async () => {
    const { gridId, sizeId, typeId } = await makeGrid(3, 3);
    await addSlot(gridId, sizeId, typeId, 0, 0, "available");
    await addSlot(gridId, sizeId, typeId, 2, 2, "available");

    const outside = await slotsOutside(gridId, 2, 2);
    const blocking = outside.filter((slot) => isOccupied(slot.state));

    expect(outside).toHaveLength(1);
    expect(blocking).toHaveLength(0);
  });

  it("never drops a slot that the planned bounds still contain", async () => {
    const { gridId, sizeId, typeId } = await makeGrid(3, 3);
    const kept = await addSlot(gridId, sizeId, typeId, 1, 1, "live");

    // A 2x2 plan still contains (1,1), so the live booking is untouched.
    const outside = await slotsOutside(gridId, 2, 2);
    expect(outside.map((s) => s.id)).not.toContain(kept);
  });

  it("plans the grid the wall can actually hold", async () => {
    // 320cm wide, 21cm frames, 10cm gaps: 10 frames need 10*21 + 11*10 = 320.
    const plan = planLayout({
      wallWidthCm: 320,
      wallHeightCm: 240,
      slotWidthCm: 21,
      slotHeightCm: 30,
      gapCm: 10,
    });

    expect(plan.colCount).toBe(10);
    expect(plan.usedWidthCm).toBeLessThanOrEqual(320);
    expect(plan.problem).toBeNull();
  });
});
