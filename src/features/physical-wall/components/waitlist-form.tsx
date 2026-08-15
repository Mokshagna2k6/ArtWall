"use client";

import { useActionState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { joinWaitlist, leaveWaitlist } from "@/features/physical-wall/actions/waitlist";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import type { WaitlistEntry } from "@/features/physical-wall/data/waitlist";

const TIER_COPY: Record<string, string> = {
  founding: "Founding members go first.",
  repeat: "You've exhibited before, which moves you up.",
  referred: "You were referred, which moves you up.",
  new: "New artists are placed in arrival order.",
};

/**
 * Joining the queue when the wall is full (F10).
 *
 * Shows the artist their actual position rather than "you're on the list",
 * because a number is information and a reassurance is not. The tier is
 * explained in the same breath, so a founding member can see *why* they are
 * fourth and not fortieth — a priority system nobody can see reads as
 * favouritism.
 */
export function WaitlistPanel({
  entry,
  position,
  queueLength,
  defaultName,
  defaultContact,
  mediums,
  cities,
}: {
  entry: WaitlistEntry | null;
  position: number | null;
  queueLength: number;
  defaultName: string;
  defaultContact: string;
  mediums: readonly string[];
  cities: readonly string[];
}) {
  const [joinState, joinAction] = useActionState(joinWaitlist, IDLE);
  const [leaveState, leaveAction] = useActionState(leaveWaitlist, IDLE);

  if (entry) {
    const offered = entry.status === "offered";
    return (
      <div className="border-hairline rounded-md border p-6">
        {offered ? (
          <>
            <p className="text-signal text-eyebrow">A slot has opened</p>
            <h2 className="font-heading text-section mt-3">
              {entry.matchedSlotLabel} is being held for you.
            </h2>
            <p className="text-ink-muted mt-3 text-sm leading-6">
              {entry.offerExpiresAt
                ? `It's yours until ${new Date(entry.offerExpiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}, after which it goes to the next artist in the queue.`
                : "Claim it before it passes to the next artist."}
            </p>
            <a
              href="/physical-wall/book"
              className="bg-ember text-wall-paper hover:bg-ember-glow text-small mt-5 inline-flex h-10 items-center rounded-md px-4 font-medium transition-colors"
            >
              Book it now
            </a>
          </>
        ) : (
          <>
            <p className="text-signal text-eyebrow">You&rsquo;re in the queue</p>
            <h2 className="font-heading text-section mt-3">
              {position ? `Number ${position}` : "Waiting"}
              {position && queueLength > 0 ? ` of ${queueLength}` : ""}
            </h2>
            <p className="text-ink-muted mt-3 text-sm leading-6">
              {TIER_COPY[entry.tier] ?? TIER_COPY.new} We&rsquo;ll message you on{" "}
              {entry.contact} the moment something matching opens up, and hold it
              for 48 hours.
            </p>
          </>
        )}

        <form action={leaveAction} className="mt-6">
          <input type="hidden" name="waitlistId" value={entry.id} />
          <SubmitButton variant="quiet">Leave the queue</SubmitButton>
          <div className="mt-2">
            <FormStatus state={leaveState} />
          </div>
        </form>
      </div>
    );
  }

  return (
    <form action={joinAction} className="flex flex-col gap-5">
      <Field label="Your name" htmlFor="wl-name">
        <input
          id="wl-name"
          name="name"
          required
          maxLength={80}
          defaultValue={defaultName}
          className={inputClass}
        />
      </Field>

      <Field
        label="How we reach you"
        htmlFor="wl-contact"
        hint="Phone or email — whichever you actually check."
      >
        <input
          id="wl-contact"
          name="contact"
          required
          maxLength={120}
          defaultValue={defaultContact}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="wl-city">
          <select id="wl-city" name="city" className={inputClass}>
            <option value="">Prefer not to say</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </Field>

        <Field label="What you make" htmlFor="wl-medium">
          <select id="wl-medium" name="medium" className={inputClass}>
            <option value="">Prefer not to say</option>
            {mediums.map((medium) => (
              <option key={medium} value={medium}>
                {medium}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Slot preference"
        htmlFor="wl-size"
        hint="Optional. Helps us match you to the right opening rather than the next one."
      >
        <input
          id="wl-size"
          name="sizePref"
          maxLength={60}
          placeholder="Large, at eye level"
          className={inputClass}
        />
      </Field>

      <div className="border-hairline rounded-md border p-4">
        <label className="flex cursor-pointer gap-3 text-sm leading-6">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-1 size-4 shrink-0"
          />
          <span>
            I agree to ArtWall storing my name and contact to hold my place and
            tell me when a slot opens.{" "}
            <span className="text-ink-muted">
              Deleted when you leave the queue, or when you take a slot.
            </span>
          </span>
        </label>
      </div>

      <div>
        <SubmitButton>Hold my place</SubmitButton>
      </div>
      <FormStatus state={joinState} />
    </form>
  );
}
