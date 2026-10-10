"use client";

import { useState } from "react";
import { Check, GripVertical } from "lucide-react";

import {
  SLOT_STATE_META,
  type SlotState,
} from "@/features/physical-wall/state-machine";
import type { SlotWithCatalog } from "@/features/physical-wall/types";
import { formatINR } from "@/features/physical-wall/money";

/**
 * The wall, in three modes.
 *
 * One component rather than three: the layout maths, the state treatment and
 * the cell labelling are identical everywhere the wall appears, and three
 * copies would drift the moment someone adds a state.
 *
 *  - `read`   — the public view, and the admin's overview. Nothing is clickable.
 *  - `select` — the booking flow. Available slots toggle in and out of a basket.
 *  - `edit`   — the admin grid editor. Slots pick up and drop onto other cells.
 *
 * **Slots are drawn at their real proportions.** A small slot is a small
 * rectangle and an X-Large is nearly twice its height, scaled from the physical
 * centimetres in the size catalog. This is the single thing that makes the grid
 * read as a wall rather than a spreadsheet — an artist choosing a position can
 * see the shape of what they are renting, which is the actual decision they are
 * making. Taken from the prototype, which hard-coded the heights; here they are
 * derived, so a new size class is drawn correctly without anyone editing this file.
 *
 * Accessibility (spec §9.6, WCAG 2.1 AA): the editor is **not drag-only**.
 * Pointer drag and a keyboard path (focus a slot, Enter to pick it up, move to a
 * cell, Enter to drop) do the same thing. State is never carried by colour
 * alone — every cell names its state in text, and the legend below spells out
 * the mapping.
 */

export type WallGridMode = "read" | "select" | "edit";

const TONE_CLASS: Record<string, string> = {
  ok: "border-signal/45 bg-signal/[0.06] text-ink",
  warn: "border-terracotta bg-terracotta/10 text-ink",
  busy: "border-hairline-strong bg-band text-ink-muted",
  off: "border-hairline bg-wall-charcoal text-ink-muted",
};

/**
 * Physical height to on-screen height.
 *
 * Clamped rather than linear: a true-to-scale grid would make a Small slot
 * unreadably short and an X-Large one push the grid off the screen. The floor
 * keeps the label legible, the ceiling keeps the wall on one screen, and in
 * between the ordering and the rough ratios survive — which is all the artist
 * needs to compare two positions.
 */
function slotHeight(hCm: number): number {
  const MIN = 52;
  const MAX = 104;
  const SMALLEST_CM = 40;
  const LARGEST_CM = 120;

  const t = (hCm - SMALLEST_CM) / (LARGEST_CM - SMALLEST_CM);
  return Math.round(MIN + Math.min(1, Math.max(0, t)) * (MAX - MIN));
}

export interface WallGridProps {
  slots: SlotWithCatalog[];
  rowCount: number;
  colCount: number;
  mode: WallGridMode;
  /** select mode: the currently chosen slot ids. */
  selected?: string[];
  onToggle?: (slotId: string) => void;
  /** edit mode: called with the slot to move and the cell to move it to. */
  onMove?: (slotId: string, row: number, col: number) => void;
  /** edit mode: opens the slot's settings. */
  onEdit?: (slot: SlotWithCatalog) => void;
  /** Hide the legend where the surrounding page already explains the states. */
  showLegend?: boolean;
}

export function WallGrid({
  slots,
  rowCount,
  colCount,
  mode,
  selected = [],
  onToggle,
  onMove,
  onEdit,
  showLegend = true,
}: WallGridProps) {
  /** The slot currently "picked up", by pointer drag or by keyboard. */
  const [carrying, setCarrying] = useState<string | null>(null);

  const byCell = new Map(
    slots.map((slot) => [`${slot.rowIndex}-${slot.colIndex}`, slot])
  );

  function drop(row: number, col: number) {
    if (!carrying || !onMove) return;
    onMove(carrying, row, col);
    setCarrying(null);
  }

  // Each row is sized to its tallest slot, so a row of Smalls does not inherit
  // the height of the Larges two rows down.
  const rowHeights = Array.from({ length: rowCount }, (_, row) => {
    const inRow = slots.filter((slot) => slot.rowIndex === row);
    return inRow.length === 0
      ? 60
      : Math.max(...inRow.map((slot) => slotHeight(slot.hCm)));
  });

  // Which states actually appear, so the legend explains this wall rather than
  // listing nine states of which four are never used.
  const statesInUse = Array.from(
    new Set(slots.map((slot) => slot.state as SlotState))
  ).sort();

  return (
    <div className="flex flex-col gap-3">
      {mode === "edit" && (
        <p className="text-ink-muted text-xs leading-5" aria-live="polite">
          {carrying
            ? "Carrying a slot — choose a cell to drop it on, or press Escape to put it back. Dropping onto an occupied cell swaps the two."
            : "Drag a slot to move it, or focus one and press Enter to pick it up."}
        </p>
      )}

      <div className="bg-band border-hairline overflow-x-auto rounded-md border p-3">
        <div
          role="grid"
          aria-label="The physical wall"
          aria-rowcount={rowCount}
          aria-colcount={colCount}
          className="grid min-w-fit gap-2"
          style={{
            gridTemplateColumns: `repeat(${colCount}, minmax(4.25rem, 1fr))`,
            gridTemplateRows: rowHeights.map((h) => `${h}px`).join(" "),
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setCarrying(null);
          }}
        >
          {Array.from({ length: rowCount }).flatMap((_, row) =>
            Array.from({ length: colCount }).map((__, col) => (
              <Cell
                key={`${row}-${col}`}
                row={row}
                col={col}
                slot={byCell.get(`${row}-${col}`)}
                mode={mode}
                isSelected={
                  byCell.get(`${row}-${col}`)
                    ? selected.includes(byCell.get(`${row}-${col}`)!.id)
                    : false
                }
                isCarrying={carrying === byCell.get(`${row}-${col}`)?.id}
                carryingSomething={carrying !== null}
                onToggle={onToggle}
                onPickUp={setCarrying}
                onDrop={drop}
                onEdit={onEdit}
              />
            ))
          )}
        </div>

        {showLegend && statesInUse.length > 0 && (
          <ul className="border-hairline mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3">
            {statesInUse.map((state) => {
              const meta = SLOT_STATE_META[state];
              return (
                <li
                  key={state}
                  className="text-ink-muted flex items-center gap-1.5 text-xs"
                >
                  <span
                    aria-hidden
                    className={`size-2.5 rounded-[2px] border ${TONE_CLASS[meta.tone]}`}
                  />
                  {meta.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Cell({
  row,
  col,
  slot,
  mode,
  isSelected,
  isCarrying,
  carryingSomething,
  onToggle,
  onPickUp,
  onDrop,
  onEdit,
}: {
  row: number;
  col: number;
  slot?: SlotWithCatalog;
  mode: WallGridMode;
  isSelected: boolean;
  isCarrying: boolean;
  carryingSomething: boolean;
  onToggle?: (slotId: string) => void;
  onPickUp: (slotId: string | null) => void;
  onDrop: (row: number, col: number) => void;
  onEdit?: (slot: SlotWithCatalog) => void;
}) {
  // An empty cell only exists mid-resize, but it must still render as a valid
  // drop target so a slot can be moved into the gap.
  if (!slot) {
    return (
      <button
        type="button"
        role="gridcell"
        aria-label={`Empty cell, row ${row + 1}, column ${col + 1}`}
        disabled={mode !== "edit" || !carryingSomething}
        onClick={() => onDrop(row, col)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => onDrop(row, col)}
        className="border-hairline text-ink-muted h-full rounded-[3px] border border-dashed text-[0.625rem] disabled:cursor-default"
      >
        {mode === "edit" && carryingSomething ? "Drop" : ""}
      </button>
    );
  }

  const meta = SLOT_STATE_META[slot.state as SlotState];
  const isAvailable = slot.state === "available";
  const description = `${slot.label}, ${slot.sizeName}, ${slot.wCm} by ${slot.hCm} centimetres, ${slot.typeLabel}, ${meta.label}`;

  if (mode === "read") {
    return (
      <div
        role="gridcell"
        aria-label={description}
        title={description}
        className={`flex h-full flex-col justify-between rounded-[3px] border p-1.5 ${TONE_CLASS[meta.tone]}`}
      >
        <span className="text-[0.6875rem] leading-none font-medium">
          {slot.label}
        </span>
        <span className="text-[0.625rem] leading-none">{meta.label}</span>
      </div>
    );
  }

  if (mode === "select") {
    // `gridcell` sits on the wrapper and the toggle state on the button:
    // aria-pressed is not supported on the gridcell role, and putting both on
    // one element makes the control ambiguous to a screen reader.
    return (
      <div role="gridcell" className="contents">
        <button
          type="button"
          aria-pressed={isSelected}
          aria-label={`${description}${isAvailable ? `, ${formatINR(slot.basePricePaise)} per day` : " — not available"}`}
          title={description}
          disabled={!isAvailable}
          onClick={() => onToggle?.(slot.id)}
          className={`flex h-full flex-col justify-between rounded-[3px] border p-1.5 text-left transition-colors ${
            isSelected
              ? "border-ink bg-ink text-wall-paper"
              : `${TONE_CLASS[meta.tone]} ${
                  isAvailable
                    ? "hover:border-ink cursor-pointer"
                    : "cursor-not-allowed opacity-55"
                }`
          }`}
        >
          <span className="flex items-start justify-between gap-1">
            <span className="text-[0.6875rem] leading-none font-medium">
              {slot.label}
            </span>
            {isSelected && <Check className="size-3 shrink-0" aria-hidden />}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[0.625rem] leading-none">
              {isAvailable ? slot.sizeName : meta.label}
            </span>
            {isAvailable && (
              <span className="text-[0.625rem] leading-none tabular-nums opacity-75">
                {formatINR(slot.basePricePaise)}
              </span>
            )}
          </span>
        </button>
      </div>
    );
  }

  // edit
  return (
    <div
      role="gridcell"
      className={`relative h-full rounded-[3px] border ${TONE_CLASS[meta.tone]} ${
        isCarrying ? "ring-ink ring-2" : ""
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(row, col)}
    >
      <button
        type="button"
        draggable
        aria-label={`${description}. ${isCarrying ? "Picked up." : "Press Enter to pick up."}`}
        title={description}
        onDragStart={() => onPickUp(slot.id)}
        onDragEnd={() => onPickUp(null)}
        onClick={() => (carryingSomething ? onDrop(row, col) : onPickUp(slot.id))}
        className="flex h-full w-full cursor-grab flex-col justify-between p-1.5 text-left"
      >
        <span className="flex items-center justify-between gap-1">
          <span className="text-[0.6875rem] leading-none font-medium">
            {slot.label}
          </span>
          <GripVertical className="size-3 shrink-0 opacity-40" aria-hidden />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-[0.625rem] leading-none">{slot.sizeName}</span>
          <span className="text-[0.625rem] leading-none opacity-75">
            {meta.label}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onEdit?.(slot)}
        aria-label={`Settings for ${slot.label}`}
        className="border-hairline-strong bg-wall-paper text-ink-muted hover:text-ink absolute -top-1.5 -right-1.5 rounded-full border px-1.5 text-[0.625rem] leading-4"
      >
        edit
      </button>
    </div>
  );
}
