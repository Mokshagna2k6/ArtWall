"use client";

import { useActionState, useState, useTransition } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import {
  moveSlot,
  resizeGrid,
  saveAsTemplate,
} from "@/features/physical-wall/actions/grid";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import { SlotModal } from "@/features/physical-wall/components/slot-modal";
import { WallGrid } from "@/features/physical-wall/components/wall-grid";
import type {
  GridConfig,
  SizeClass,
  SlotType,
  SlotWithCatalog,
} from "@/features/physical-wall/types";

/**
 * The wall layout editor (F01, F02, C01).
 *
 * Two things happen here and they are deliberately separate: the *shape* of the
 * wall is edited on this page (resize, drag to reorder, save a template), and
 * an individual slot is configured in a modal reached by clicking it. Clicking
 * the thing you want to change is the whole interaction — there is no settings
 * tree to walk.
 *
 * Every write goes through a server action with its own validation and audit
 * entry. There is no quieter path for the edit that happens most often.
 */
export function GridEditor({
  grid,
  slots,
  sizes,
  types,
}: {
  grid: GridConfig;
  slots: SlotWithCatalog[];
  sizes: SizeClass[];
  types: SlotType[];
}) {
  const [resizeState, resizeAction] = useActionState(resizeGrid, IDLE);
  const [moveState, moveAction] = useActionState(moveSlot, IDLE);
  const [templateState, templateAction] = useActionState(saveAsTemplate, IDLE);

  const [editing, setEditing] = useState<SlotWithCatalog | null>(null);
  const [, startTransition] = useTransition();

  /**
   * Submit a move.
   *
   * The action is dispatched with a FormData built right here rather than
   * through a hidden form. A hidden form would need its values set first, and
   * setting them via a ref then calling `requestSubmit()` in the same tick
   * submits the *previous* render's values — the DOM has not caught up. Passing
   * the payload directly removes the ordering problem instead of timing around
   * it, and still goes through the same action, validation and audit trail as
   * every other write.
   */
  function handleMove(slotId: string, row: number, col: number) {
    const slot = slots.find((candidate) => candidate.id === slotId);
    if (!slot) return;

    const payload = new FormData();
    payload.set("slotId", slotId);
    payload.set("targetRow", String(row));
    payload.set("targetCol", String(col));
    payload.set("version", String(slot.version));

    startTransition(() => moveAction(payload));
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="font-heading text-section">Layout</h2>
        <p className="text-ink-muted mt-2 text-sm leading-6">
          {grid.name} — {grid.rowCount} × {grid.colCount}, {slots.length} slots.
          Slots holding a booking are locked and carry across a resize.
        </p>

        <div className="mt-6 max-w-3xl">
          <WallGrid
            slots={slots}
            rowCount={grid.rowCount}
            colCount={grid.colCount}
            mode="edit"
            onMove={handleMove}
            onEdit={setEditing}
          />
        </div>
        <FormStatus state={moveState} />
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section className="border-hairline rounded-md border p-5">
          <h2 className="font-heading text-card">Resize the wall</h2>
          <p className="text-ink-muted mt-2 text-xs leading-5">
            Shrinking is refused if it would orphan an occupied slot. New cells
            are created in the first size class and type.
          </p>
          <form action={resizeAction} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="gridId" value={grid.id} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Rows" htmlFor="rowCount">
                <input
                  id="rowCount"
                  name="rowCount"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={grid.rowCount}
                  className={inputClass}
                />
              </Field>
              <Field label="Columns" htmlFor="colCount">
                <input
                  id="colCount"
                  name="colCount"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={grid.colCount}
                  className={inputClass}
                />
              </Field>
            </div>
            <SubmitButton>Apply</SubmitButton>
            <FormStatus state={resizeState} />
          </form>
        </section>

        <section className="border-hairline rounded-md border p-5">
          <h2 className="font-heading text-card">Save as a template</h2>
          <p className="text-ink-muted mt-2 text-xs leading-5">
            Keeps the shape, sizes and types. Not the bookings — a template
            describes a wall, not what is on it.
          </p>
          <form action={templateAction} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="gridId" value={grid.id} />
            <Field label="Name" htmlFor="templateName">
              <input
                id="templateName"
                name="name"
                required
                maxLength={60}
                placeholder="Diwali layout"
                className={inputClass}
              />
            </Field>
            <SubmitButton variant="quiet">Save template</SubmitButton>
            <FormStatus state={templateState} />
          </form>
        </section>
      </div>

      {editing && (
        <SlotModal
          slot={editing}
          sizes={sizes}
          types={types}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
