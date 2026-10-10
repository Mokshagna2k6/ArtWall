"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { IDLE } from "@/features/physical-wall/action-state";
import { adjustQueue, forceMatch } from "@/features/physical-wall/actions/waitlist";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import type { WaitlistEntry } from "@/features/physical-wall/data/waitlist";
import type { SlotWithCatalog } from "@/features/physical-wall/types";

const TIER_LABEL: Record<string, string> = {
  founding: "Founding",
  repeat: "Repeat",
  referred: "Referred",
  new: "New",
};

/**
 * Admin queue management (C04).
 *
 * The spec asks for reorder, promote/demote, remove, notes, priority override
 * and force-match. All six are here, and every one writes to
 * `pw_queue_overrides` as well as the audit log — a queue that decides who gets
 * a wall has to be able to explain itself later.
 *
 * The list renders in the order slots will actually be offered, so what an
 * admin sees is what the system will do. An entry carrying a manual rank says
 * so, because "why is this person third" should never need a database query.
 */
export function AdminQueue({
  entries,
  availableSlots,
}: {
  entries: WaitlistEntry[];
  availableSlots: SlotWithCatalog[];
}) {
  const [state, action] = useActionState(adjustQueue, IDLE);

  if (entries.length === 0) {
    return (
      <p className="border-hairline text-ink-muted rounded-md border border-dashed p-8 text-center text-sm leading-6">
        Nobody is waiting. When the wall fills up, artists who join the queue
        appear here in the order they&rsquo;ll be offered slots.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <FormStatus state={state} />

      <ol className="flex flex-col gap-3">
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <QueueRow
              entry={entry}
              position={index + 1}
              action={action}
              availableSlots={availableSlots}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function QueueRow({
  entry,
  position,
  action,
  availableSlots,
}: {
  entry: WaitlistEntry;
  position: number;
  action: (formData: FormData) => void;
  availableSlots: SlotWithCatalog[];
}) {
  const [matchState, matchAction] = useActionState(forceMatch, IDLE);
  const [expanded, setExpanded] = useState(false);

  const offered = entry.status === "offered";

  return (
    <article className="border-hairline rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          <span
            aria-hidden
            className="bg-band text-ink flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-medium tabular-nums"
          >
            {position}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{entry.name}</p>
            <p className="text-ink-muted mt-0.5 text-xs">
              {[entry.city, entry.medium, entry.sizePref]
                .filter(Boolean)
                .join(" · ") || "No preferences given"}
            </p>
            <p className="text-ink-muted mt-1 text-xs">{entry.contact}</p>
            {entry.note && (
              <p className="text-ink mt-1.5 text-xs leading-5">
                Note: {entry.note}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <span className="border-hairline-strong text-label rounded-full border px-2.5 py-0.5 tracking-wider uppercase">
            {TIER_LABEL[entry.tier] ?? entry.tier}
          </span>
          {entry.priorityRank !== null && (
            <span className="text-ink-muted text-xs">Manually ranked</span>
          )}
          {entry.overrideCount > 0 && (
            <span className="text-ink-muted text-xs">
              {entry.overrideCount} override
              {entry.overrideCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {offered ? (
        <p className="border-signal/40 bg-signal/[0.06] mt-4 rounded-md border p-3 text-sm leading-6">
          Holding <strong>{entry.matchedSlotLabel}</strong> for them
          {entry.offerExpiresAt
            ? ` until ${new Date(entry.offerExpiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
            : ""}
          .
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(["promote", "demote"] as const).map((move) => (
            <form key={move} action={action}>
              <input type="hidden" name="waitlistId" value={entry.id} />
              <input type="hidden" name="move" value={move} />
              <button
                type="submit"
                aria-label={`${move === "promote" ? "Promote" : "Demote"} ${entry.name}`}
                className="border-hairline-strong hover:border-ink text-small inline-flex h-9 items-center gap-1.5 rounded-md border px-3"
              >
                {move === "promote" ? (
                  <ArrowUp className="size-3.5" aria-hidden />
                ) : (
                  <ArrowDown className="size-3.5" aria-hidden />
                )}
                {move === "promote" ? "Up" : "Down"}
              </button>
            </form>
          ))}

          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="text-ink-muted hover:text-ink text-small underline underline-offset-4"
          >
            {expanded ? "Close" : "Offer a slot, note or remove"}
          </button>
        </div>
      )}

      {expanded && !offered && (
        <div className="border-hairline mt-4 flex flex-col gap-6 border-t pt-4">
          <form action={matchAction} className="flex flex-col gap-3">
            <input type="hidden" name="waitlistId" value={entry.id} />
            <Field
              label="Offer an open slot"
              htmlFor={`slot-${entry.id}`}
              hint="Holds it for them for 48 hours. They still book and pay themselves."
            >
              <select
                id={`slot-${entry.id}`}
                name="slotId"
                required
                className={inputClass}
              >
                <option value="">Choose a slot</option>
                {availableSlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label} · {slot.sizeName} · {slot.typeLabel}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <SubmitButton variant="quiet">Offer it</SubmitButton>
            </div>
            <FormStatus state={matchState} />
            {availableSlots.length === 0 && (
              <p className="text-ink-muted text-xs">
                Nothing is free to offer right now.
              </p>
            )}
          </form>

          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="waitlistId" value={entry.id} />
            <input type="hidden" name="move" value="note" />
            <Field label="Note" htmlFor={`note-${entry.id}`}>
              <input
                id={`note-${entry.id}`}
                name="note"
                defaultValue={entry.note ?? ""}
                maxLength={280}
                className={inputClass}
              />
            </Field>
            <div>
              <SubmitButton variant="quiet">Save note</SubmitButton>
            </div>
          </form>

          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="waitlistId" value={entry.id} />
            <input type="hidden" name="move" value="remove" />
            <Field
              label="Remove from the queue"
              htmlFor={`remove-${entry.id}`}
              hint="A reason is required, and it is logged."
            >
              <input
                id={`remove-${entry.id}`}
                name="note"
                required
                minLength={3}
                maxLength={280}
                className={inputClass}
              />
            </Field>
            <div>
              <SubmitButton variant="danger">Remove</SubmitButton>
            </div>
          </form>
        </div>
      )}
    </article>
  );
}
