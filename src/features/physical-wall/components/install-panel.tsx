"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Circle, QrCode, ScanLine } from "lucide-react";

import { IDLE } from "@/features/physical-wall/action-state";
import {
  receiveArtwork,
  updateChecklist,
  verifyAndGoLive,
} from "@/features/physical-wall/actions/ops";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import type { Checkin } from "@/features/physical-wall/data/ops";
import type { BookingDetail } from "@/features/physical-wall/types";

/**
 * The staff install panel (F14, F15).
 *
 * Built for someone holding a phone in one hand and a painting in the other, so
 * it follows the prototype's two-step shape: **verify the code, then work the
 * checklist**, with the blocking condition stated before they try rather than
 * after they fail.
 *
 * The go-live button is disabled until every item is ticked *and saved*. That
 * is a courtesy, not the control — the server refuses an incomplete checklist
 * and names what is outstanding, because a disabled button is one console away
 * from being enabled and the wall's integrity cannot rest on that.
 */
export function InstallPanel({
  booking,
  checkins,
}: {
  booking: BookingDetail;
  checkins: Checkin[];
}) {
  const [receiveState, receiveAction] = useActionState(receiveArtwork, IDLE);

  return (
    <article className="border-hairline rounded-md border p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-label text-ink-muted tracking-wider uppercase">
            {booking.slots.map((slot) => slot.label).join(", ")} · from{" "}
            {booking.startDate}
          </p>
          <p className="font-heading text-card mt-1">
            {booking.artworkTitle ?? "No artwork attached yet"}
          </p>
          <p className="text-ink-muted mt-1 text-sm">{booking.artistName}</p>
        </div>
      </header>

      {!booking.artworkTitle && (
        <p className="border-terracotta mt-4 rounded-md border border-dashed p-3 text-sm leading-6">
          The artist hasn&rsquo;t attached a work to this booking yet. Ask them
          to do that before you install — the QR label has nothing to point at
          otherwise.
        </p>
      )}

      {checkins.length === 0 ? (
        <form action={receiveAction} className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="bookingId" value={booking.id} />
          <p className="text-ink-muted text-sm leading-6">
            Mark the work as received to generate its checklist. The items are
            worked out from the slot&rsquo;s size, its type and the add-ons on
            this booking.
          </p>
          <div>
            <SubmitButton>Receive the work</SubmitButton>
          </div>
          <FormStatus state={receiveState} />
        </form>
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          {checkins.map((checkin) => (
            <ChecklistRunner key={checkin.id} checkin={checkin} />
          ))}
        </div>
      )}
    </article>
  );
}

function ChecklistRunner({ checkin }: { checkin: Checkin }) {
  const [saveState, saveAction] = useActionState(updateChecklist, IDLE);
  const [liveState, liveAction] = useActionState(verifyAndGoLive, IDLE);
  const [ticked, setTicked] = useState<string[]>(checkin.completed);

  const total = checkin.checklist.length;
  const allTicked = total > 0 && ticked.length === total;
  // Saved, not merely ticked: the server reads the stored list, so an unsaved
  // tick would pass the button's test and fail the server's.
  const savedComplete =
    total > 0 && checkin.completed.length === total && saveState.status !== "error";
  const alreadyLive = checkin.status === "verified";

  return (
    <section className="border-hairline border-t pt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-card">Slot {checkin.slotLabel}</h3>
        {alreadyLive ? (
          <span className="text-signal inline-flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="size-4" aria-hidden />
            Live
          </span>
        ) : (
          <span className="text-ink-muted text-sm tabular-nums">
            {ticked.length}/{total}
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        {/* Step 1 — the checklist. */}
        <form action={saveAction} className="flex flex-col gap-4">
          <p className="text-label text-ink-muted tracking-wider uppercase">
            1 · Pre-install checklist
          </p>
          <input type="hidden" name="checkinId" value={checkin.id} />

          <ul className="flex flex-col">
            {checkin.checklist.map((item, index) => {
              const on = ticked.includes(item.key);
              return (
                <li
                  key={item.key}
                  className={index > 0 ? "border-hairline border-t" : undefined}
                >
                  <label className="flex cursor-pointer gap-3 py-3 text-sm leading-6">
                    <input
                      type="checkbox"
                      name="completed"
                      value={item.key}
                      checked={on}
                      disabled={alreadyLive}
                      onChange={() =>
                        setTicked((current) =>
                          current.includes(item.key)
                            ? current.filter((key) => key !== item.key)
                            : [...current, item.key]
                        )
                      }
                      className="sr-only"
                    />
                    {on ? (
                      <CheckCircle2
                        className="text-signal mt-0.5 size-5 shrink-0"
                        aria-hidden
                      />
                    ) : (
                      <Circle
                        className="text-ink-muted mt-0.5 size-5 shrink-0"
                        aria-hidden
                      />
                    )}
                    <span>
                      <span className={on ? "font-medium" : undefined}>
                        {item.label}
                      </span>
                      <span className="text-ink-muted block text-xs leading-5">
                        {item.reason}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {!alreadyLive && (
            <>
              <Field label="Condition notes" htmlFor={`notes-${checkin.id}`}>
                <input
                  id={`notes-${checkin.id}`}
                  name="conditionNotes"
                  defaultValue={checkin.conditionNotes ?? ""}
                  placeholder="Any damage or concern, before it goes up"
                  className={inputClass}
                />
              </Field>
              <div>
                <SubmitButton variant="quiet">
                  {allTicked ? "Save — all done" : "Save progress"}
                </SubmitButton>
              </div>
              <FormStatus state={saveState} />
            </>
          )}
        </form>

        {/* Step 2 — scan and activate. */}
        {!alreadyLive && (
          <form action={liveAction} className="flex flex-col gap-4">
            <p className="text-label text-ink-muted tracking-wider uppercase">
              2 · Verify and go live
            </p>

            <div
              className={`flex h-28 flex-col items-center justify-center gap-2 rounded-md border text-center ${
                savedComplete
                  ? "border-signal/40 bg-signal/[0.06]"
                  : "border-hairline bg-band"
              }`}
            >
              {savedComplete ? (
                <>
                  <ScanLine className="text-signal size-6" aria-hidden />
                  <p className="text-sm">Checklist complete — scan the code</p>
                </>
              ) : (
                <>
                  <QrCode className="text-ink-muted size-6" aria-hidden />
                  <p className="text-ink-muted px-4 text-xs leading-5">
                    Finish and save the checklist first. The server refuses an
                    incomplete one.
                  </p>
                </>
              )}
            </div>

            <input type="hidden" name="slotId" value={checkin.slotId} />
            <Field
              label="Artist's booking code"
              htmlFor={`token-${checkin.id}`}
              hint="Scan it with the camera, or type the code printed under the QR."
            >
              <input
                id={`token-${checkin.id}`}
                name="token"
                required
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} font-mono`}
              />
            </Field>

            <div>
              <SubmitButton>Verify and go live</SubmitButton>
            </div>
            <FormStatus state={liveState} />
          </form>
        )}
      </div>
    </section>
  );
}
