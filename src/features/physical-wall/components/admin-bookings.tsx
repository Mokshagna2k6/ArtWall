"use client";

import { useActionState, useState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { forceRelease } from "@/features/physical-wall/actions/admin-slots";
import { markBookingPaid } from "@/features/physical-wall/actions/payment";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import { formatINR } from "@/features/physical-wall/money";
import type { BookingDetail } from "@/features/physical-wall/types";

/**
 * The admin bookings table (F12, F17 fallback).
 *
 * Force-release is behind a two-step confirm and a typed word, not because
 * admins are careless but because the action cancels someone's exhibition and
 * moves money. The reason field is required and lands in the audit log — a
 * release nobody can explain later is worse than no release.
 */
export function AdminBookings({
  bookings,
  paymentsEnabled,
}: {
  bookings: BookingDetail[];
  paymentsEnabled: boolean;
}) {
  if (bookings.length === 0) {
    return (
      <p className="border-hairline text-ink-muted rounded-md border border-dashed p-8 text-center text-sm">
        No bookings yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {bookings.map((booking) => (
        <li key={booking.id}>
          <BookingRow booking={booking} paymentsEnabled={paymentsEnabled} />
        </li>
      ))}
    </ul>
  );
}

function BookingRow({
  booking,
  paymentsEnabled,
}: {
  booking: BookingDetail;
  paymentsEnabled: boolean;
}) {
  const [payState, payAction] = useActionState(markBookingPaid, IDLE);
  const [releaseState, releaseAction] = useActionState(forceRelease, IDLE);
  const [confirming, setConfirming] = useState(false);

  return (
    <article className="border-hairline rounded-md border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-ink-muted text-label tracking-wider uppercase">
            {booking.slots.map((slot) => slot.label).join(", ") || "no slots"} ·{" "}
            {booking.status}
          </p>
          <p className="font-heading text-card mt-1">
            {booking.artworkTitle ?? "No artwork attached"}
          </p>
          <p className="text-ink-muted mt-1 text-sm">
            {booking.artistName} · {booking.startDate} → {booking.endDate} ·{" "}
            {formatINR(booking.totalAmountPaise)}
          </p>
          <p className="text-ink-muted mt-1 text-xs">
            Refund policy v{booking.refundPolicyVersion ?? "—"} applies to this
            booking.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-6">
        {booking.status === "held" && (
          <form action={payAction} className="flex flex-col gap-3">
            <input type="hidden" name="bookingId" value={booking.id} />
            <Field
              label="How did the money arrive?"
              htmlFor={`note-${booking.id}`}
              hint={
                paymentsEnabled
                  ? "For payments taken outside Razorpay."
                  : "Razorpay is off, so this is the confirmation path."
              }
            >
              <input
                id={`note-${booking.id}`}
                name="note"
                required
                minLength={3}
                placeholder="UPI to the founder account, ref 4471"
                className={inputClass}
              />
            </Field>
            <SubmitButton variant="quiet">Mark as paid</SubmitButton>
            <FormStatus state={payState} />
          </form>
        )}

        {booking.slots.length > 0 && booking.status !== "cancelled" && (
          <div className="flex flex-col gap-3">
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="border-destructive/40 text-destructive hover:bg-destructive/5 text-small inline-flex h-10 items-center rounded-md border px-4"
              >
                Force-release
              </button>
            ) : (
              <form action={releaseAction} className="flex flex-col gap-3">
                <input
                  type="hidden"
                  name="slotId"
                  value={booking.slots[0].slotId}
                />
                <p className="text-ink-muted max-w-sm text-xs leading-5">
                  This cancels the booking, returns every slot on it to the
                  wall, and raises a refund from the policy version above — not
                  today&rsquo;s. If anything is hanging, a de-install task is
                  created.
                </p>
                <Field label="Reason (audited)" htmlFor={`reason-${booking.id}`}>
                  <input
                    id={`reason-${booking.id}`}
                    name="reason"
                    required
                    minLength={3}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Type 'release' to confirm"
                  htmlFor={`confirm-${booking.id}`}
                >
                  <input
                    id={`confirm-${booking.id}`}
                    name="confirm"
                    required
                    autoComplete="off"
                    className={inputClass}
                  />
                </Field>
                <div className="flex gap-2">
                  <SubmitButton variant="danger">Release it</SubmitButton>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="text-ink-muted hover:text-ink text-small underline underline-offset-4"
                  >
                    Cancel
                  </button>
                </div>
                <FormStatus state={releaseState} />
              </form>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
