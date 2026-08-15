"use client";

import { useActionState } from "react";
import Link from "next/link";

import { IDLE } from "@/features/physical-wall/action-state";
import { chooseInstallWindow, issueBookingToken } from "@/features/physical-wall/actions/ops";
import { startPayment } from "@/features/physical-wall/actions/payment";
import { AgreementPanel } from "@/features/physical-wall/components/agreement-panel";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import { formatINR } from "@/features/physical-wall/money";
import type { Booking } from "@/features/physical-wall/types";

/**
 * One booking, as the artist sees it (F13, F17, F31).
 *
 * What is on offer depends entirely on the booking's state, so the card is a
 * small state machine of its own rather than a row of buttons that mostly error:
 * a held booking offers payment, a paid one offers an install window and the
 * counter code, and anything else just shows what happened.
 */
export function BookingCard({
  booking,
  slotLabels,
  qrBase,
  paymentsEnabled,
  agreement,
}: {
  booking: Booking;
  slotLabels: string[];
  qrBase: string;
  paymentsEnabled: boolean;
  /** Null until the artist signs. Gates install scheduling and go-live (F20). */
  agreement: { signedAt: string; termsHash: string } | null;
}) {
  const [payState, payAction] = useActionState(startPayment, IDLE);
  const [windowState, windowAction] = useActionState(chooseInstallWindow, IDLE);
  const [tokenState, tokenAction] = useActionState(issueBookingToken, IDLE);

  const token =
    tokenState.status === "ok" && tokenState.data
      ? (tokenState.data as { token?: string }).token
      : undefined;

  const holdLapsed =
    booking.status === "held" &&
    booking.holdExpiresAt !== null &&
    new Date(booking.holdExpiresAt) < new Date();

  // "Ended" is a paid booking whose last day has passed, or one already marked
  // completed. Derived from the dates rather than waiting for a status change,
  // so the survey appears the morning after the work comes down instead of
  // whenever someone gets round to closing the booking out.
  const ended =
    booking.status === "completed" ||
    (booking.status === "paid" && booking.endDate < new Date().toISOString().slice(0, 10));

  return (
    <article className="border-hairline rounded-md border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-ink-muted text-label tracking-wider uppercase">
            {slotLabels.join(", ") || "No slots"}
          </p>
          <p className="font-heading text-card mt-1">
            {booking.startDate} → {booking.endDate}
          </p>
          <p className="text-ink-muted mt-1 text-sm">
            {booking.durationDays} day{booking.durationDays === 1 ? "" : "s"} ·{" "}
            {formatINR(booking.totalAmountPaise)} inc. GST
          </p>
        </div>
        <StatusPill status={holdLapsed ? "expired" : booking.status} />
      </div>

      {booking.status === "held" && !holdLapsed && (
        <div className="border-hairline mt-5 border-t pt-5">
          <p className="text-ink-muted text-sm leading-6">
            Your slots are held until{" "}
            {booking.holdExpiresAt
              ? new Date(booking.holdExpiresAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "the hold expires"}
            .
          </p>
          {paymentsEnabled ? (
            <form action={payAction} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="bookingId" value={booking.id} />
              <SubmitButton>Pay {formatINR(booking.totalAmountPaise)}</SubmitButton>
              <FormStatus state={payState} />
            </form>
          ) : (
            <p className="border-hairline text-ink-muted mt-4 rounded-md border border-dashed p-3 text-xs leading-5">
              Online payment isn&rsquo;t switched on yet. Pay at the venue or by
              transfer and we&rsquo;ll confirm this booking by hand.
            </p>
          )}
        </div>
      )}

      {holdLapsed && (
        <p className="text-ink-muted mt-5 text-sm leading-6">
          The hold lapsed, so the slots went back to the wall. Nothing was
          charged — book again when you&rsquo;re ready.
        </p>
      )}

      {/* The agreement gates everything after payment (F20), so it sits above
          the install controls rather than beside them. */}
      {booking.status === "paid" && (
        <AgreementPanel
          bookingId={booking.id}
          signedAt={agreement?.signedAt ?? null}
          termsHash={agreement?.termsHash ?? null}
        />
      )}

      {booking.status === "paid" && agreement && (
        <div className="border-hairline mt-5 flex flex-col gap-6 border-t pt-5">
          <form action={windowAction} className="flex flex-col gap-3">
            <Field
              label="Install window"
              htmlFor={`startsAt-${booking.id}`}
              hint="One hour. Bring the work and your booking code."
            >
              <input
                id={`startsAt-${booking.id}`}
                name="startsAt"
                type="datetime-local"
                className={inputClass}
              />
            </Field>
            <input type="hidden" name="bookingId" value={booking.id} />
            <SubmitButton variant="quiet">Book this window</SubmitButton>
            <FormStatus state={windowState} />
          </form>

          <form action={tokenAction} className="flex flex-col gap-3">
            <input type="hidden" name="bookingId" value={booking.id} />
            <SubmitButton variant="quiet">
              Show my code (install &amp; Ric Platter perk)
            </SubmitButton>
            <FormStatus state={tokenState} />
            {token && (
              <a
                href={`${qrBase}/q/${token}`}
                className="border-hairline-strong text-small hover:border-ink inline-flex h-10 items-center justify-center rounded-md border px-4"
              >
                Open my code
              </a>
            )}
          </form>
        </div>
      )}

      {/* The exhibition is over: the only thing left to ask for is what they
          made of it (F32). Offered once, here, rather than chased by email. */}
      {ended && (
        <div className="border-hairline mt-5 border-t pt-5">
          <p className="text-ink-muted text-sm leading-6">
            This one has come down. If you have two minutes, tell us how it went
            — it shapes how the next one runs.
          </p>
          <Link
            href={`/physical-wall/feedback/${booking.id}`}
            className="border-hairline-strong hover:border-ink text-small mt-4 inline-flex h-10 items-center rounded-md border px-4"
          >
            How was it?
          </Link>
        </div>
      )}
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    held: "border-terracotta text-ink",
    paid: "border-signal/50 text-signal",
    expired: "border-hairline-strong text-ink-muted",
    cancelled: "border-hairline-strong text-ink-muted",
    refunded: "border-hairline-strong text-ink-muted",
    completed: "border-hairline-strong text-ink-muted",
  };

  return (
    <span
      className={`text-label rounded-full border px-3 py-1 tracking-wider uppercase ${tone[status] ?? "border-hairline-strong text-ink-muted"}`}
    >
      {status}
    </span>
  );
}
