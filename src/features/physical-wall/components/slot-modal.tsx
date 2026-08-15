"use client";

import { useActionState, useEffect, useRef } from "react";
import { X } from "lucide-react";

import { IDLE } from "@/features/physical-wall/action-state";
import {
  forceRelease,
  setSlotServiceState,
  transitionSlot,
} from "@/features/physical-wall/actions/admin-slots";
import { editSlot } from "@/features/physical-wall/actions/grid";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import {
  SLOT_STATE_META,
  SLOT_TRANSITIONS,
  type SlotState,
} from "@/features/physical-wall/state-machine";
import type {
  SizeClass,
  SlotType,
  SlotWithCatalog,
} from "@/features/physical-wall/types";

/**
 * Configure one slot (F03, F04, F05, F12).
 *
 * The prototype's best admin idea, and the reason this is a modal rather than a
 * page: everything about one position — its size, its type, where it can go
 * next, and the two force actions — is in one place, reached by clicking the
 * slot itself. Editing the wall stops being a trip through a settings tree and
 * becomes pointing at the thing you mean.
 *
 * **Only legal transitions are offered.** The buttons are generated from the
 * state machine, so an admin is never shown a move the server will reject, and
 * adding a state to the machine adds its buttons here without anyone editing
 * this file. The server re-checks regardless — the UI is a convenience, not
 * the control.
 */
export function SlotModal({
  slot,
  sizes,
  types,
  onClose,
}: {
  slot: SlotWithCatalog;
  sizes: SizeClass[];
  types: SlotType[];
  onClose: () => void;
}) {
  const [editState, editAction] = useActionState(editSlot, IDLE);
  const [moveState, moveAction] = useActionState(transitionSlot, IDLE);
  const [serviceState, serviceAction] = useActionState(setSlotServiceState, IDLE);
  const [releaseState, releaseAction] = useActionState(forceRelease, IDLE);

  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, focus starts inside. A dialog you cannot dismiss from the
  // keyboard is a trap, and this one covers the wall map behind it.
  useEffect(() => {
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = SLOT_STATE_META[slot.state as SlotState];
  const nextStates = SLOT_TRANSITIONS[slot.state as SlotState];
  const isOccupied = ["reserved", "booked", "received", "installed", "live"].includes(
    slot.state
  );

  return (
    <div
      className="fixed inset-0 z-200 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Slot ${slot.label}`}
        className="bg-wall-paper max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-md sm:rounded-md"
      >
        <div className="border-hairline bg-wall-paper sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="font-heading text-card">Slot {slot.label}</p>
            <p className="text-ink-muted mt-0.5 text-xs">
              {slot.sizeName} · {slot.wCm}×{slot.hCm}cm · {slot.typeLabel} ·{" "}
              {meta.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink hover:bg-band -mr-2 inline-flex size-9 items-center justify-center rounded-md"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-8 px-5 py-6">
          <section>
            <h3 className="text-label text-ink-muted tracking-wider uppercase">
              Configuration
            </h3>
            <form action={editAction} className="mt-3 flex flex-col gap-4">
              <input type="hidden" name="slotId" value={slot.id} />
              <input type="hidden" name="version" value={slot.version} />

              <Field label="Label" htmlFor="modal-label">
                <input
                  id="modal-label"
                  name="label"
                  defaultValue={slot.label}
                  maxLength={24}
                  required
                  className={inputClass}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Size class"
                  htmlFor="modal-size"
                  hint={
                    isOccupied
                      ? "Locked while something is on this slot."
                      : undefined
                  }
                >
                  <select
                    id="modal-size"
                    name="sizeId"
                    defaultValue={slot.sizeId}
                    disabled={isOccupied}
                    className={`${inputClass} disabled:opacity-60`}
                  >
                    {sizes.map((size) => (
                      <option key={size.id} value={size.id}>
                        {size.name} ({size.wCm}×{size.hCm}cm)
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Type" htmlFor="modal-type">
                  <select
                    id="modal-type"
                    name="typeId"
                    defaultValue={slot.typeId}
                    className={inputClass}
                  >
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label} ({type.multiplierBp / 10000}×)
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div>
                <SubmitButton variant="quiet">Save configuration</SubmitButton>
              </div>
              <FormStatus state={editState} />
            </form>
          </section>

          <section className="border-hairline border-t pt-6">
            <h3 className="text-label text-ink-muted tracking-wider uppercase">
              Move this slot
            </h3>
            <p className="text-ink-muted mt-2 text-xs leading-5">
              Only moves the lifecycle allows are shown. Everything here is
              recorded against your name.
            </p>

            {nextStates.length === 0 ? (
              <p className="text-ink-muted mt-3 text-sm">
                {meta.label} is a terminal state — nothing follows it.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {nextStates.map((next) => (
                  <form key={next} action={moveAction}>
                    <input type="hidden" name="slotId" value={slot.id} />
                    <input type="hidden" name="version" value={slot.version} />
                    <input type="hidden" name="to" value={next} />
                    <button
                      type="submit"
                      className="border-hairline-strong hover:border-ink text-small inline-flex h-9 items-center rounded-md border px-3"
                    >
                      → {SLOT_STATE_META[next].label}
                    </button>
                  </form>
                ))}
              </div>
            )}
            <div className="mt-2">
              <FormStatus state={moveState} />
            </div>
          </section>

          {!isOccupied && (
            <section className="border-hairline border-t pt-6">
              <h3 className="text-label text-ink-muted tracking-wider uppercase">
                Service
              </h3>
              <p className="text-ink-muted mt-2 text-xs leading-5">
                Take the position out of use without cancelling anything — the
                wall has a damaged fixing, or the light above it has failed.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["maintenance", "blocked", "available"] as const)
                  .filter((target) => target !== slot.state)
                  .map((target) => (
                    <form key={target} action={serviceAction}>
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="to" value={target} />
                      <button
                        type="submit"
                        className="border-hairline-strong hover:border-ink text-small inline-flex h-9 items-center rounded-md border px-3 capitalize"
                      >
                        {target}
                      </button>
                    </form>
                  ))}
              </div>
              <div className="mt-2">
                <FormStatus state={serviceState} />
              </div>
            </section>
          )}

          {isOccupied && (
            <section className="border-destructive/30 border-t pt-6">
              <h3 className="text-destructive text-label tracking-wider uppercase">
                Force-release
              </h3>
              <p className="text-ink-muted mt-2 text-xs leading-5">
                Cancels the booking, returns every slot on it to the wall, and
                raises a refund from the policy version that booking was made
                under — not today&rsquo;s. If something is hanging, a de-install
                task is created.
              </p>

              <form action={releaseAction} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="slotId" value={slot.id} />
                <Field label="Reason (audited)" htmlFor="modal-reason">
                  <input
                    id="modal-reason"
                    name="reason"
                    required
                    minLength={3}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Type 'release' to confirm"
                  htmlFor="modal-confirm"
                >
                  <input
                    id="modal-confirm"
                    name="confirm"
                    required
                    autoComplete="off"
                    className={inputClass}
                  />
                </Field>
                <div>
                  <SubmitButton variant="danger">Release it</SubmitButton>
                </div>
                <FormStatus state={releaseState} />
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
