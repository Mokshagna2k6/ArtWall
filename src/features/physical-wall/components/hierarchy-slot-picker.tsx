"use client";

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";

/**
 * FE-3.13: pick a slot by walking the WallOS hierarchy — venue, then wall,
 * then slot — instead of the flat grid (F64; Bible §30-34).
 *
 * This never resolves to anything but a `pw_slots.id`: each hierarchy slot
 * carries the `pwSlotId` it was linked to (wallos/actions.ts's
 * `listBookableWallosHierarchy`, via the `wallos_slot_id` FK), and clicking
 * one calls `onSelect(pwSlotId)` — the exact id `reserveBooking` already
 * expects. This component has no opinion about reservation at all; it only
 * narrows "which pw_slots.id" down through three clicks instead of a grid.
 *
 * A venue with only one wall, or a wall with only one slot, still shows that
 * step rather than skipping it: skipping would make the picker's depth
 * inconsistent from one venue to the next, which is worse than one extra
 * click on the common case (today, exactly one venue, one wall).
 */

export interface HierarchySlot {
  id: string;
  label: string;
  pwSlotId: string;
  pwSlotLabel: string;
  available: boolean;
}
export interface HierarchyWall {
  id: string;
  name: string;
  slots: HierarchySlot[];
}
export interface HierarchyVenue {
  id: string;
  name: string;
  walls: HierarchyWall[];
}
export interface HierarchyOrg {
  id: string;
  name: string;
  venues: HierarchyVenue[];
}

export function HierarchySlotPicker({
  hierarchy,
  selected,
  onToggle,
}: {
  hierarchy: HierarchyOrg[];
  selected: string[];
  onToggle: (pwSlotId: string) => void;
}) {
  const venues = hierarchy.flatMap((org) => org.venues.map((venue) => ({ ...venue, orgName: org.name })));
  const [venueId, setVenueId] = useState<string | null>(venues.length === 1 ? venues[0].id : null);
  const venue = venues.find((v) => v.id === venueId) ?? null;

  const [wallId, setWallId] = useState<string | null>(null);
  const wall = venue?.walls.find((w) => w.id === wallId) ?? null;

  if (venues.length === 0) {
    return (
      <p className="border-hairline text-ink-muted rounded-md border border-dashed p-4 text-sm leading-6">
        No venue has any slot linked into the WallOS hierarchy yet — ask an
        admin to link one from the WallOS hierarchy console, or use the wall
        map above.
      </p>
    );
  }

  // Venue step.
  if (!venue) {
    return (
      <ol className="flex flex-col gap-2">
        {venues.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => setVenueId(v.id)}
              className="border-hairline-strong hover:border-ink flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors"
            >
              <span>
                <span className="font-medium">{v.name}</span>
                <span className="text-ink-muted"> · {v.orgName}</span>
              </span>
              <ChevronRight className="text-ink-muted size-4 shrink-0" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
    );
  }

  // Wall step.
  if (!wall) {
    return (
      <div className="flex flex-col gap-3">
        <Crumb items={[{ label: venue.name, onClick: () => setVenueId(null) }]} />
        <ol className="flex flex-col gap-2">
          {venue.walls.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => setWallId(w.id)}
                className="border-hairline-strong hover:border-ink flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors"
              >
                <span>
                  <span className="font-medium">{w.name}</span>
                  <span className="text-ink-muted"> · {w.slots.length} slot{w.slots.length === 1 ? "" : "s"}</span>
                </span>
                <ChevronRight className="text-ink-muted size-4 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
          {venue.walls.length === 0 && (
            <li className="text-ink-muted text-sm">No wall in this venue has a linked slot yet.</li>
          )}
        </ol>
      </div>
    );
  }

  // Slot step.
  return (
    <div className="flex flex-col gap-3">
      <Crumb
        items={[
          { label: venue.name, onClick: () => setVenueId(null) },
          { label: wall.name, onClick: () => setWallId(null) },
        ]}
      />
      <ol className="flex flex-col gap-2">
        {wall.slots.map((slot) => {
          const isSelected = selected.includes(slot.pwSlotId);
          return (
            <li key={slot.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                disabled={!slot.available}
                onClick={() => onToggle(slot.pwSlotId)}
                className={`flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                  isSelected
                    ? "border-ink bg-ink text-wall-paper"
                    : slot.available
                      ? "border-hairline-strong hover:border-ink"
                      : "border-hairline bg-band text-ink-muted cursor-not-allowed opacity-55"
                }`}
              >
                <span className="font-medium">{slot.pwSlotLabel}</span>
                <span className="flex items-center gap-2">
                  {!slot.available && <span className="text-xs">Not available</span>}
                  {isSelected && <Check className="size-4 shrink-0" aria-hidden />}
                </span>
              </button>
            </li>
          );
        })}
        {wall.slots.length === 0 && (
          <li className="text-ink-muted text-sm">No slot on this wall is linked yet.</li>
        )}
      </ol>
    </div>
  );
}

function Crumb({ items }: { items: { label: string; onClick: () => void }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-ink-muted flex items-center gap-1.5 text-xs">
      <button type="button" onClick={() => items[0]?.onClick()} className="hover:text-ink hover:underline">
        Venues
      </button>
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden>/</span>
          {i === items.length - 1 ? (
            <span className="text-ink font-medium">{item.label}</span>
          ) : (
            <button type="button" onClick={item.onClick} className="hover:text-ink hover:underline">
              {item.label}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
