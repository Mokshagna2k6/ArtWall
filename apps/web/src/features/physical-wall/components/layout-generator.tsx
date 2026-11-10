"use client";

import { useActionState, useMemo, useState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { generateLayout } from "@/features/physical-wall/actions/grid";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import { planLayout } from "@/features/physical-wall/layout-plan";
import type { GridConfig, SizeClass, SlotType } from "@/features/physical-wall/types";

/**
 * Generate a wall layout from measurements (F01).
 *
 * The preview is the point. It runs the same `planLayout` the server action
 * runs, so what the admin reads before pressing the button is exactly what
 * they get after — a generator that surprises you is worse than doing the
 * arithmetic by hand, because you stop trusting it.
 *
 * Regenerating is destructive to empty slots, so the button says so and the
 * action refuses outright if a booked slot would be lost.
 */
export function LayoutGenerator({
  grid,
  sizes,
  types,
}: {
  grid: GridConfig;
  sizes: SizeClass[];
  types: SlotType[];
}) {
  const [state, action] = useActionState(generateLayout, IDLE);

  const [wallWidthCm, setWallWidthCm] = useState(320);
  const [wallHeightCm, setWallHeightCm] = useState(240);
  const [gapCm, setGapCm] = useState(10);
  const [sizeId, setSizeId] = useState(sizes[0]?.id ?? "");

  const size = sizes.find((candidate) => candidate.id === sizeId) ?? sizes[0];

  const plan = useMemo(
    () =>
      size
        ? planLayout({
            wallWidthCm,
            wallHeightCm,
            slotWidthCm: size.wCm,
            slotHeightCm: size.hCm,
            gapCm,
          })
        : null,
    [size, wallWidthCm, wallHeightCm, gapCm]
  );

  if (sizes.length === 0 || types.length === 0) {
    return (
      <section className="border-border rounded border p-5">
        <h2 className="font-heading text-card">Generate from measurements</h2>
        <p className="text-ink-muted mt-2 text-sm leading-6">
          Add at least one size class and one slot type first — the generator needs
          to know how big a frame is before it can work out how many fit.
        </p>
      </section>
    );
  }

  return (
    <section className="border-border rounded border p-5">
      <h2 className="font-heading text-card">Generate from measurements</h2>
      <p className="text-ink-muted mt-1 text-sm leading-6">
        Measure the usable wall — exclude switches, doors and fixtures — and this
        works out the grid.
      </p>

      <form action={action} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="gridId" value={grid.id} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Wall width (cm)" htmlFor="gen-width">
            <input
              id="gen-width"
              className={inputClass}
              name="wallWidthCm"
              type="number"
              min={30}
              max={5000}
              required
              value={wallWidthCm}
              onChange={(event) => setWallWidthCm(Number(event.target.value))}
            />
          </Field>
          <Field label="Wall height (cm)" htmlFor="gen-height">
            <input
              id="gen-height"
              className={inputClass}
              name="wallHeightCm"
              type="number"
              min={30}
              max={1000}
              required
              value={wallHeightCm}
              onChange={(event) => setWallHeightCm(Number(event.target.value))}
            />
          </Field>
          <Field label="Gap (cm)" htmlFor="gen-gap">
            <input
              id="gen-gap"
              className={inputClass}
              name="gapCm"
              type="number"
              min={0}
              max={100}
              required
              value={gapCm}
              onChange={(event) => setGapCm(Number(event.target.value))}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Size class" htmlFor="gen-size">
            <select
              id="gen-size"
              className={inputClass}
              name="sizeId"
              value={sizeId}
              onChange={(event) => setSizeId(event.target.value)}
            >
              {sizes.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.wCm}×{candidate.hCm}cm)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Slot type" htmlFor="gen-type">
            <select id="gen-type" className={inputClass} name="typeId" defaultValue={types[0]?.id}>
              {types.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {plan && (
          <div
            className="bg-band rounded p-4 text-sm leading-6"
            aria-live="polite"
          >
            {plan.slotCount > 0 ? (
              <>
                <p>
                  <span className="font-medium">
                    {plan.rowCount} rows × {plan.colCount} columns — {plan.slotCount} slots.
                  </span>
                </p>
                <p className="text-ink-muted mt-1">
                  Occupies {plan.usedWidthCm}×{plan.usedHeightCm}cm, leaving{" "}
                  {plan.leftoverWidthCm}cm spare width and {plan.leftoverHeightCm}cm spare
                  height to centre the hang within.
                </p>
              </>
            ) : (
              <p className="text-ink-muted">{plan.problem}</p>
            )}
            {plan.slotCount > 0 && plan.problem && (
              <p className="mt-2 text-xs leading-5 text-amber-700">{plan.problem}</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-4">
          <SubmitButton disabled={!plan || plan.slotCount === 0}>
            Generate layout
          </SubmitButton>
          <p className="text-ink-muted text-xs leading-5">
            Replaces empty slots outside the new grid. Booked slots are never removed —
            the generator refuses instead.
          </p>
        </div>

        <FormStatus state={state} />
      </form>
    </section>
  );
}
