"use server";

import { updateTag } from "next/cache";

import { recordAuditIn } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import { isOccupied, type SlotState } from "@/features/physical-wall/state-machine";
import {
  gridResizeSchema,
  gridTemplateSchema,
  slotEditSchema,
  slotMoveSchema,
} from "@/features/physical-wall/schema";
import {
  fail,
  firstIssue,
  inTransaction,
  newId,
  ok,
  PreconditionError,
  StaleWriteError,
  toActionError,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";

/**
 * The grid editor (F01, F02, C01).
 *
 * The wall is not a fixed board: an admin adds, removes, resizes and repositions
 * slots at will. The one thing they may never do is destroy a commitment — a
 * slot carrying a live, installed, received, booked or reserved artwork is
 * locked and carried across every re-config.
 *
 * Every structural edit here is transactional, version-checked, and audited.
 */

/**
 * Resize the wall (F01).
 *
 * Growing adds slots in the default size and type. Shrinking removes only slots
 * that fall outside the new bounds *and* carry nothing — if a booked slot would
 * be orphaned the whole resize is rejected with the labels named, because
 * "rejected, and here is what is in the way" is actionable and "rejected" is not.
 */
export async function resizeGrid(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = gridResizeSchema.safeParse({
      gridId: formData.get("gridId"),
      rowCount: formData.get("rowCount"),
      colCount: formData.get("colCount"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { gridId, rowCount, colCount } = parsed.data;

    const summary = await inTransaction(async (client) => {
      const grid = await client.query<{
        row_count: number;
        col_count: number;
        name: string;
      }>(
        `select row_count, col_count, name from pw_grid_config
         where id = $1 for update`,
        [gridId]
      );
      if (grid.rowCount === 0) throw new PreconditionError("No such wall layout.");

      const before = grid.rows[0];

      // Which existing slots would fall outside the new bounds?
      const outside = await client.query<{
        id: string;
        label: string;
        state: SlotState;
      }>(
        `select id, label, state from pw_slots
         where grid_id = $1 and (row_index >= $2 or col_index >= $3)
         for update`,
        [gridId, rowCount, colCount]
      );

      const blocking = outside.rows.filter((slot) => isOccupied(slot.state));
      if (blocking.length > 0) {
        throw new PreconditionError(
          `Cannot shrink the wall: ${blocking
            .map((slot) => `${slot.label} (${slot.state})`)
            .join(", ")} ${blocking.length === 1 ? "is" : "are"} occupied. ` +
            "Release or end those bookings first."
        );
      }

      const removedIds = outside.rows.map((slot) => slot.id);
      if (removedIds.length > 0) {
        await client.query(`delete from pw_slots where id = any($1::text[])`, [
          removedIds,
        ]);
      }

      // Fill any cell inside the new bounds that has no slot. `on conflict do
      // nothing` on the (grid, row, col) index makes this safe to run over a
      // grid that is only partly filled.
      const defaults = await client.query<{ size_id: string; type_id: string }>(
        `select
           (select id from pw_size_catalog where active order by sort_order limit 1) as size_id,
           (select id from pw_slot_types  where active order by sort_order limit 1) as type_id`
      );
      const { size_id: sizeId, type_id: typeId } = defaults.rows[0] ?? {};
      if (!sizeId || !typeId) {
        throw new PreconditionError(
          "Add at least one size class and one slot type before resizing."
        );
      }

      let added = 0;
      for (let row = 0; row < rowCount; row += 1) {
        for (let col = 0; col < colCount; col += 1) {
          const inserted = await client.query(
            `insert into pw_slots (id, grid_id, row_index, col_index, label, size_id, type_id, state)
             values ($1, $2, $3, $4, $5, $6, $7, 'available')
             on conflict (grid_id, row_index, col_index) do nothing`,
            [
              newId("slot"),
              gridId,
              row,
              col,
              `${String.fromCharCode(65 + row)}${col + 1}`,
              sizeId,
              typeId,
            ]
          );
          added += inserted.rowCount ?? 0;
        }
      }

      await client.query(
        `update pw_grid_config
         set row_count = $2, col_count = $3, version = version + 1, updated_at = now()
         where id = $1`,
        [gridId, rowCount, colCount]
      );

      await recordAuditIn(client, {
        actor,
        action: "grid.reconfigured",
        subjectType: "grid",
        subjectId: gridId,
        before: { rowCount: before.row_count, colCount: before.col_count },
        after: { rowCount, colCount, added, removed: removedIds.length },
      });

      return { added, removed: removedIds.length };
    });

    updateTag(WALL_TAG);
    return ok(
      `Wall is now ${rowCount}×${colCount}. ${summary.added} slot(s) added, ${summary.removed} removed.`
    );
  } catch (error) {
    return toActionError("resizeGrid", error);
  }
}

/**
 * Move a slot to another cell (F02).
 *
 * A drop onto an occupied cell is a **swap**, never an overwrite — the two
 * slots exchange coordinates in one transaction. Done naively that trips the
 * unique index on (grid, row, col) halfway through, so the moving slot is
 * parked at a negative row first, which no real cell ever uses.
 *
 * The version check is what stops two admins dragging the same slot in
 * different directions and one of them silently losing.
 */
export async function moveSlot(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = slotMoveSchema.safeParse({
      slotId: formData.get("slotId"),
      targetRow: formData.get("targetRow"),
      targetCol: formData.get("targetCol"),
      version: formData.get("version"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { slotId, targetRow, targetCol, version } = parsed.data;

    await inTransaction(async (client) => {
      const source = await client.query<{
        id: string;
        grid_id: string;
        row_index: number;
        col_index: number;
        label: string;
        version: number;
      }>(
        `select id, grid_id, row_index, col_index, label, version
         from pw_slots where id = $1 for update`,
        [slotId]
      );
      if (source.rowCount === 0) throw new PreconditionError("No such slot.");

      const slot = source.rows[0];
      if (slot.version !== version) throw new StaleWriteError();

      if (slot.row_index === targetRow && slot.col_index === targetCol) return;

      const target = await client.query<{ id: string; version: number }>(
        `select id, version from pw_slots
         where grid_id = $1 and row_index = $2 and col_index = $3
         for update`,
        [slot.grid_id, targetRow, targetCol]
      );

      // Park the mover outside the grid so neither update collides with the
      // unique cell index while the swap is half-done.
      await client.query(
        `update pw_slots set row_index = -1, col_index = -1 where id = $1`,
        [slotId]
      );

      if (target.rowCount === 1) {
        await client.query(
          `update pw_slots
           set row_index = $2, col_index = $3, version = version + 1, updated_at = now()
           where id = $1`,
          [target.rows[0].id, slot.row_index, slot.col_index]
        );
      }

      await client.query(
        `update pw_slots
         set row_index = $2, col_index = $3, version = version + 1, updated_at = now()
         where id = $1`,
        [slotId, targetRow, targetCol]
      );

      await recordAuditIn(client, {
        actor,
        action: "slot.moved",
        subjectType: "slot",
        subjectId: slotId,
        before: { row: slot.row_index, col: slot.col_index },
        after: {
          row: targetRow,
          col: targetCol,
          swappedWith: target.rows[0]?.id ?? null,
        },
      });
    });

    updateTag(WALL_TAG);
    return ok("Slot moved.");
  } catch (error) {
    return toActionError("moveSlot", error);
  }
}

/** Rename a slot or change its size class / type (F03, F05). */
export async function editSlot(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = slotEditSchema.safeParse({
      slotId: formData.get("slotId"),
      label: formData.get("label"),
      sizeId: formData.get("sizeId"),
      typeId: formData.get("typeId"),
      version: formData.get("version"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { slotId, label, sizeId, typeId, version } = parsed.data;

    await inTransaction(async (client) => {
      const current = await client.query<{
        label: string;
        size_id: string;
        type_id: string;
        state: SlotState;
        version: number;
      }>(
        `select label, size_id, type_id, state, version from pw_slots
         where id = $1 for update`,
        [slotId]
      );
      if (current.rowCount === 0) throw new PreconditionError("No such slot.");

      const before = current.rows[0];
      if (before.version !== version) throw new StaleWriteError();

      // A size change re-prices future bookings only (F03). Changing the class
      // under a live piece would also mean the physical dimensions on the label
      // no longer match what is hanging, so it is refused outright.
      if (isOccupied(before.state) && before.size_id !== sizeId) {
        throw new PreconditionError(
          `${before.label} is ${before.state}. Its size class can change once the work comes down.`
        );
      }

      await client.query(
        `update pw_slots
         set label = $2, size_id = $3, type_id = $4, version = version + 1, updated_at = now()
         where id = $1`,
        [slotId, label, sizeId, typeId]
      );

      await recordAuditIn(client, {
        actor,
        action: "slot.edited",
        subjectType: "slot",
        subjectId: slotId,
        before: {
          label: before.label,
          sizeId: before.size_id,
          typeId: before.type_id,
        },
        after: { label, sizeId, typeId },
      });
    });

    updateTag(WALL_TAG);
    return ok("Slot updated.");
  } catch (error) {
    return toActionError("editSlot", error);
  }
}

/** Save the current layout as a reusable template (C01). */
export async function saveAsTemplate(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = gridTemplateSchema.safeParse({
      gridId: formData.get("gridId"),
      name: formData.get("name"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { gridId, name } = parsed.data;
    const templateId = newId("grid");

    await inTransaction(async (client) => {
      const source = await client.query<{ row_count: number; col_count: number }>(
        `select row_count, col_count from pw_grid_config where id = $1`,
        [gridId]
      );
      if (source.rowCount === 0) throw new PreconditionError("No such wall layout.");

      await client.query(
        `insert into pw_grid_config (id, name, row_count, col_count, is_template, active, created_by)
         values ($1, $2, $3, $4, true, false, $5)`,
        [
          templateId,
          name,
          source.rows[0].row_count,
          source.rows[0].col_count,
          actor.id,
        ]
      );

      // Copy the slot layout, not its state: a template describes shape, and a
      // saved template that remembered "A3 is live" would be nonsense to apply.
      await client.query(
        `insert into pw_slots (id, grid_id, row_index, col_index, label, size_id, type_id, state)
         select $1 || '-' || row_index || '-' || col_index, $1, row_index, col_index,
                label, size_id, type_id, 'available'
         from pw_slots where grid_id = $2`,
        [templateId, gridId]
      );

      await recordAuditIn(client, {
        actor,
        action: "grid.template.saved",
        subjectType: "grid",
        subjectId: templateId,
        after: { name, copiedFrom: gridId },
      });
    });

    updateTag(WALL_TAG);
    return ok(`Saved '${name}' as a template.`);
  } catch (error) {
    return toActionError("saveAsTemplate", error);
  }
}
