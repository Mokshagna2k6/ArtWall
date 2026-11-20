"use client";

import Link from "next/link";
import { useActionState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import {
  saveSlotPricingForm,
  saveVenueDetailsForm,
  saveWallDetailsForm,
  setVenueListedForm,
  type ManagedWall,
} from "@/features/wallos/wall-manager/actions";
import {
  VENUE_TYPE_LABELS,
  VENUE_TYPES,
} from "@/features/wallos/wall-manager/venue-types";

/**
 * The Wall Manager screen: one venue's address, its walls' sizes, and the
 * price of every slot.
 *
 * Three separate forms rather than one big one, deliberately. A Wall Manager
 * fills this in over days — the address when the venue signs, the sizes after
 * someone visits with a tape measure, the prices when commercial terms are
 * agreed. One giant submit would mean a half-measured wall could not be saved
 * at all, and would make every save a write to all three tables.
 *
 * Each form posts the id it edits as a hidden field, and the server re-derives
 * that row's venue and re-checks the grant against it (see actions.ts) — so a
 * tampered hidden id is refused rather than trusted.
 */

export interface ManagedVenue {
  id: string;
  name: string;
  venueType: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  listed: boolean;
  description: string | null;
}

export function WallManagerEditor({
  venues,
  venue,
  walls,
}: {
  venues: { id: string; name: string; city: string | null; listed: boolean }[];
  venue: ManagedVenue | null;
  walls: ManagedWall[];
}) {
  if (venues.length === 0) {
    return (
      <p className="text-ink-muted mt-8 max-w-prose leading-7">
        You do not manage any venues yet. A Wall Network Admin grants the Wall
        Manager role for a venue, and it then appears here.
      </p>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-12">
      <nav aria-label="Venues">
        <p className="text-label text-ink-muted tracking-wider uppercase">Your venues</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {venues.map((v) => {
            const active = v.id === venue?.id;
            return (
              <li key={v.id}>
                <Link
                  href={`/wall-manager?venue=${encodeURIComponent(v.id)}`}
                  aria-current={active ? "page" : undefined}
                  className={`text-small inline-flex h-10 items-center gap-2 rounded-md border px-3 ${
                    active
                      ? "border-ink bg-ink/5 font-medium"
                      : "border-hairline-strong hover:border-ink"
                  }`}
                >
                  {v.name}
                  {v.city && <span className="text-ink-muted">· {v.city}</span>}
                  <span
                    className={`text-xs ${v.listed ? "text-signal" : "text-ink-muted"}`}
                  >
                    {v.listed ? "listed" : "draft"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {venue && (
        <>
          <VenueForm venue={venue} />
          <ListingToggle venue={venue} />
          <WallsSection walls={walls} />
        </>
      )}
    </div>
  );
}

function VenueForm({ venue }: { venue: ManagedVenue }) {
  const [state, action] = useActionState(saveVenueDetailsForm, IDLE);

  return (
    <section>
      <h2 className="font-heading text-subsection">Where this venue is</h2>
      <p className="text-ink-muted mt-2 max-w-prose text-sm leading-6">
        Artists search for walls by city and by the kind of place. Both are
        required before the venue can be listed.
      </p>

      <form action={action} className="mt-5 grid max-w-2xl gap-5 sm:grid-cols-2">
        <input type="hidden" name="venueId" value={venue.id} />

        <Field label="Kind of place" htmlFor="venueType">
          <select
            id="venueType"
            name="venueType"
            defaultValue={venue.venueType ?? ""}
            className={inputClass}
          >
            <option value="">Not set</option>
            {VENUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {VENUE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="City" htmlFor="city">
          <input
            id="city"
            name="city"
            defaultValue={venue.city ?? ""}
            className={inputClass}
            placeholder="Bengaluru"
          />
        </Field>

        <Field label="Street address" htmlFor="addressLine">
          <input
            id="addressLine"
            name="addressLine"
            defaultValue={venue.addressLine ?? ""}
            className={inputClass}
            placeholder="100 Feet Road, Indiranagar"
          />
        </Field>

        <Field label="State" htmlFor="state">
          <input
            id="state"
            name="state"
            defaultValue={venue.state ?? ""}
            className={inputClass}
            placeholder="Karnataka"
          />
        </Field>

        <Field label="Pincode" htmlFor="pincode">
          <input
            id="pincode"
            name="pincode"
            inputMode="numeric"
            defaultValue={venue.pincode ?? ""}
            className={inputClass}
            placeholder="560038"
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="What hanging here is like"
            htmlFor="description"
            hint="Shown to artists in search. Footfall, light, the kind of crowd."
          >
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={venue.description ?? ""}
              className={`${inputClass} h-auto py-2`}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <FormStatus state={state} />
          <div>
            <SubmitButton>Save venue</SubmitButton>
          </div>
        </div>
      </form>
    </section>
  );
}

function ListingToggle({ venue }: { venue: ManagedVenue }) {
  const [state, action] = useActionState(setVenueListedForm, IDLE);

  return (
    <section>
      <h2 className="font-heading text-subsection">
        {venue.listed ? "Listed for artists" : "Not yet listed"}
      </h2>
      <p className="text-ink-muted mt-2 max-w-prose text-sm leading-6">
        {venue.listed
          ? "Artists can find this venue when they search for walls."
          : "Set the city and kind of place, and price at least one slot, then list it."}
      </p>
      <form action={action} className="mt-4 flex flex-col gap-2">
        <input type="hidden" name="venueId" value={venue.id} />
        <input type="hidden" name="listed" value={venue.listed ? "false" : "true"} />
        <FormStatus state={state} />
        <div>
          <SubmitButton variant={venue.listed ? "quiet" : "primary"}>
            {venue.listed ? "Hide from search" : "List for artists"}
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function WallsSection({ walls }: { walls: ManagedWall[] }) {
  if (walls.length === 0) {
    return (
      <section>
        <h2 className="font-heading text-subsection">Walls</h2>
        <p className="text-ink-muted mt-2 max-w-prose text-sm leading-6">
          This venue has no walls yet. A Wall Network Admin adds buildings,
          floors, rooms and walls in the WallOS console; they then appear here
          to be measured and priced.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-heading text-subsection">Walls and slot prices</h2>
      <p className="text-ink-muted mt-2 max-w-prose text-sm leading-6">
        A slot with no price is not for rent. Clear the price to take it off the
        market without deleting it.
      </p>
      <div className="mt-6 flex flex-col gap-10">
        {walls.map((wall) => (
          <WallCard key={wall.id} wall={wall} />
        ))}
      </div>
    </section>
  );
}

function WallCard({ wall }: { wall: ManagedWall }) {
  const [state, action] = useActionState(saveWallDetailsForm, IDLE);

  return (
    <article className="border-hairline-strong rounded-lg border p-4 sm:p-6">
      <header>
        <h3 className="font-heading text-card">{wall.name}</h3>
        <p className="text-ink-muted mt-1 text-sm">
          {wall.buildingName} · {wall.floorName} · {wall.roomName}
        </p>
      </header>

      <form action={action} className="mt-5 grid gap-5 sm:grid-cols-3">
        <input type="hidden" name="wallId" value={wall.id} />
        <Field label="Width (cm)" htmlFor={`w-${wall.id}`}>
          <input
            id={`w-${wall.id}`}
            name="widthCm"
            inputMode="numeric"
            defaultValue={wall.widthCm ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Height (cm)" htmlFor={`h-${wall.id}`}>
          <input
            id={`h-${wall.id}`}
            name="heightCm"
            inputMode="numeric"
            defaultValue={wall.heightCm ?? ""}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-3">
          <Field
            label="Note for artists"
            htmlFor={`n-${wall.id}`}
            hint="Light, orientation, what is nearby."
          >
            <input
              id={`n-${wall.id}`}
              name="notes"
              defaultValue={wall.notes ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-3">
          <FormStatus state={state} />
          <div>
            <SubmitButton variant="quiet">Save wall</SubmitButton>
          </div>
        </div>
      </form>

      {wall.slots.length > 0 && (
        <div className="mt-6">
          <p className="text-label text-ink-muted tracking-wider uppercase">
            Slots on this wall
          </p>
          <ul className="mt-3 flex flex-col gap-4">
            {wall.slots.map((slot) => (
              <SlotRow key={slot.id} slot={slot} />
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function SlotRow({ slot }: { slot: ManagedWall["slots"][number] }) {
  const [state, action] = useActionState(saveSlotPricingForm, IDLE);

  return (
    <li className="border-hairline rounded-md border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">Slot {slot.label}</p>
        <p className="text-ink-muted text-sm">
          {slot.artworkId ? "Occupied" : slot.pricePaise === null ? "Not for rent" : "Free"}
        </p>
      </div>

      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-4">
        <input type="hidden" name="slotId" value={slot.id} />
        <Field label="Price (₹)" htmlFor={`p-${slot.id}`}>
          <input
            id={`p-${slot.id}`}
            name="priceRupees"
            inputMode="decimal"
            defaultValue={slot.pricePaise === null ? "" : slot.pricePaise / 100}
            className={inputClass}
          />
        </Field>
        <Field label="Per (days)" htmlFor={`d-${slot.id}`}>
          <input
            id={`d-${slot.id}`}
            name="periodDays"
            inputMode="numeric"
            defaultValue={slot.periodDays}
            className={inputClass}
          />
        </Field>
        <Field label="Width (cm)" htmlFor={`sw-${slot.id}`}>
          <input
            id={`sw-${slot.id}`}
            name="widthCm"
            inputMode="numeric"
            defaultValue={slot.widthCm ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Height (cm)" htmlFor={`sh-${slot.id}`}>
          <input
            id={`sh-${slot.id}`}
            name="heightCm"
            inputMode="numeric"
            defaultValue={slot.heightCm ?? ""}
            className={inputClass}
          />
        </Field>
        <div className="flex flex-col gap-2 sm:col-span-4">
          <FormStatus state={state} />
          <div>
            <SubmitButton variant="quiet">Save slot</SubmitButton>
          </div>
        </div>
      </form>
    </li>
  );
}
