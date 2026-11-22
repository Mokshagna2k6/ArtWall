"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";

import { IDLE } from "@/features/physical-wall/action-state";
import { submitFeedback } from "@/features/physical-wall/actions/engagement";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";

/**
 * The post-exhibition survey (F32).
 *
 * Voluntary, and it says so. Only the star rating is required — an artist who
 * wants to give three seconds and leave should be able to, because a survey
 * that demands ten minutes is a survey that gets abandoned and tells us
 * nothing.
 *
 * The stars are real radio inputs behind the icons rather than buttons: that
 * gives keyboard users arrow-key selection and screen readers a labelled group
 * for free, which a row of buttons would have to reimplement badly.
 */
export function FeedbackForm({
  bookingId,
  slotLabels,
  endDate,
}: {
  bookingId: string;
  slotLabels: string[];
  endDate: string;
}) {
  const [state, formAction] = useActionState(submitFeedback, IDLE);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [nps, setNps] = useState<number | null>(null);

  if (state.status === "ok") {
    return (
      <div className="border-hairline rounded-md border p-8 text-center">
        <p className="text-signal text-eyebrow">Thank you</p>
        <h2 className="font-heading text-section mt-3">{state.message}</h2>
        <p className="text-ink-muted mx-auto mt-3 max-w-sm text-sm leading-6">
          Nothing here is anonymous to us, and nothing here is published.
        </p>
        <Link
          href="/physical-wall/bookings"
          className="border-hairline-strong hover:border-ink text-small mt-6 inline-flex h-10 items-center rounded-md border px-4"
        >
          Back to your bookings
        </Link>
      </div>
    );
  }

  const shown = hovered || rating;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div>
        <p className="text-ink-muted text-sm leading-6">
          Slot{slotLabels.length === 1 ? "" : "s"} {slotLabels.join(", ")}, which
          came down on {endDate}.
        </p>
      </div>

      <fieldset>
        <legend className="text-label text-ink-muted tracking-wider uppercase">
          Overall, how was it?
        </legend>
        <div
          className="mt-3 flex gap-1"
          onMouseLeave={() => setHovered(0)}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              onMouseEnter={() => setHovered(value)}
              className="cursor-pointer p-1"
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
              />
              <span className="sr-only">
                {value} out of 5
              </span>
              <Star
                className={`size-8 transition-colors ${
                  value <= shown
                    ? "fill-terracotta text-terracotta"
                    : "text-hairline-strong"
                }`}
                aria-hidden
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-label text-ink-muted tracking-wider uppercase">
          Would you tell another artist to do this?
        </legend>
        <p className="text-ink-muted mt-1 text-xs">
          0 is never, 10 is definitely. Optional.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="nps"
                value={value}
                checked={nps === value}
                onChange={() => setNps(value)}
                className="sr-only"
              />
              <span
                className={`flex size-9 items-center justify-center rounded-md border text-sm tabular-nums transition-colors ${
                  nps === value
                    ? "border-ink bg-ink text-wall-paper"
                    : "border-hairline-strong hover:border-ink"
                }`}
              >
                {value}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label="Anything we should do differently?"
        htmlFor="note"
        hint="Optional. Read by the founders, not published anywhere."
      >
        <textarea
          id="note"
          name="note"
          rows={4}
          maxLength={1000}
          className={`${inputClass} h-auto resize-y py-2.5`}
        />
      </Field>

      <div className="flex flex-col gap-3">
        <div>
          <SubmitButton>Send feedback</SubmitButton>
        </div>
        {rating === 0 && (
          <p className="text-ink-muted text-xs">
            Pick a star rating to send — everything else is optional.
          </p>
        )}
        <FormStatus state={state} />
      </div>
    </form>
  );
}
